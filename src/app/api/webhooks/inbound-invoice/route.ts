/**
 * POST /api/webhooks/inbound-invoice
 *
 * Recibe el evento `email.received` de Resend Inbound Email (vía svix).
 * Para cada adjunto PDF:
 *   1. Llama a GET /emails/receiving/{email_id}/attachments/{attachment_id}
 *      para obtener la URL firmada (download_url) del adjunto
 *   2. Descarga el PDF
 *   3. Extrae campos con IA (número, fecha, total, desglose IVA, CIF del emisor)
 *   4. Resuelve el proveedor:
 *        a) CIF encontrado en BD → asignar directamente
 *        b) CIF nuevo → crear proveedor inactivo (pendiente de revisión)
 *        c) Sin CIF → bucket "Sin asignar"
 *   5. Crea la factura con desglose de IVA completo
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { storeFile } from "@/core/storage/StorageProvider";
import { validateDocumentBuffer, sanitizeFilename, sha256Hex } from "@/modules/hr/lib/documentUtils";
import { extractInvoiceFields } from "@/lib/ocr/extractInvoiceFields";

// ── Constantes del sistema ───────────────────────────────────────────────────

const UNASSIGNED_NAME = "Sin asignar";

// ── Helper: proveedor "Sin asignar" ─────────────────────────────────────────

async function getOrCreateUnassignedSupplierId(actorId: string): Promise<string> {
  const existing = await (prisma as any).supplier.findFirst({
    where:  { name: UNASSIGNED_NAME, isActive: false },
    select: { id: true },
  });
  if (existing) return existing.id;

  const s = await (prisma as any).supplier.create({
    data: {
      name:        UNASSIGNED_NAME,
      isActive:    false,
      branch:      "BOTH",
      notes:       "Proveedor especial del sistema. Facturas importadas sin proveedor conocido.",
      createdById: actorId,
    },
  });
  return s.id;
}

// ── Helper: resolución de proveedor por CIF ──────────────────────────────────
//
// Prioridad:
//   1. CIF extraído → buscar en BD por taxId → asignar si existe
//   2. CIF extraído pero no existe → crear proveedor inactivo (pendiente revisión)
//   3. Sin CIF → "Sin asignar"

async function resolveSupplier(
  supplierCif:  string | null | undefined,
  supplierName: string | null | undefined,
  actorId:      string,
): Promise<string> {
  if (supplierCif) {
    // Normalizar: eliminar guiones y espacios, uppercase
    const normalizedCif = supplierCif.replace(/[-\s]/g, "").toUpperCase();

    const existing = await (prisma as any).supplier.findFirst({
      where:  { taxId: normalizedCif },
      select: { id: true, name: true, isActive: true },
    });

    if (existing) {
      console.log(`[inbound-invoice] Proveedor encontrado por CIF ${normalizedCif}: ${existing.name} (activo: ${existing.isActive})`);
      return existing.id;
    }

    // No existe → crear proveedor inactivo pendiente de revisión
    const name = (supplierName?.trim()) || `Proveedor ${normalizedCif}`;
    const newSupplier = await (prisma as any).supplier.create({
      data: {
        name,
        taxId:       normalizedCif,
        isActive:    false,
        branch:      "BOTH",
        notes:       "Creado automáticamente desde factura recibida por email. Pendiente de verificación.",
        createdById: actorId,
      },
    });
    console.log(`[inbound-invoice] Proveedor creado (inactivo) para CIF ${normalizedCif}: ${name}`);
    return newSupplier.id;
  }

  // Sin CIF → "Sin asignar"
  console.log(`[inbound-invoice] Sin CIF extraído → usando bucket "Sin asignar"`);
  return getOrCreateUnassignedSupplierId(actorId);
}

// ── Tipos ────────────────────────────────────────────────────────────────────

interface ResendAttachmentMeta {
  id?:           string;
  filename?:     string;
  content_type?: string;
  size?:         number;
}

interface ResendAttachmentFull extends ResendAttachmentMeta {
  download_url?: string;
  expires_at?:   string;
}

interface ResendEmailData {
  email_id:     string;
  from:         string;
  to:           string[];
  subject?:     string;
  created_at:   string;
  attachments?: ResendAttachmentMeta[];
}

interface ResendWebhookEvent {
  type:       string;
  created_at: string;
  data:       ResendEmailData;
}

// ── Obtener URL firmada de descarga para un adjunto ──────────────────────────

async function getAttachmentDownloadUrl(
  emailId:      string,
  attachmentId: string,
): Promise<string | null> {
  const apiKey = process.env.RESEND_INBOUND_API_KEY ?? process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[inbound-invoice] Falta RESEND_INBOUND_API_KEY / RESEND_API_KEY");
    return null;
  }

  const url = `https://api.resend.com/emails/receiving/${emailId}/attachments/${attachmentId}`;
  const res  = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const text = await res.text();
  console.log(`[inbound-invoice] GET /emails/receiving/${emailId}/attachments/${attachmentId} → ${res.status}: ${text.slice(0, 400)}`);

  if (!res.ok) return null;

  try {
    const json: ResendAttachmentFull = JSON.parse(text);
    return json.download_url ?? null;
  } catch {
    return null;
  }
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();

  console.log("[inbound-invoice] Body (primeros 800 chars):", rawBody.slice(0, 800));

  // Parsear JSON
  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (event.type !== "email.received") {
    return NextResponse.json({ ok: true, skipped: "event_type_ignored" });
  }

  const { email_id, from: fromEmail, subject } = event.data;
  const payloadAttachments: ResendAttachmentMeta[] = event.data.attachments ?? [];

  console.log(`[inbound-invoice] email_id=${email_id} | adjuntos: ${payloadAttachments.length}`);

  // Filtrar PDFs del payload
  const pdfMetas = payloadAttachments.filter(a =>
    a.content_type?.toLowerCase().includes("pdf") ||
    a.filename?.toLowerCase().endsWith(".pdf")
  );

  if (pdfMetas.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, skipped: "no_pdf" });
  }

  // Actor del sistema (primer usuario activo)
  const actor = await (prisma as any).user.findFirst({
    where:   { isActive: true },
    orderBy: { createdAt: "asc" },
    select:  { id: true },
  });
  if (!actor) {
    return NextResponse.json({ error: "No system user found" }, { status: 500 });
  }

  let processed = 0;
  const errors: string[] = [];

  for (const att of pdfMetas) {
    const filename = att.filename ?? `inbound-${Date.now()}.pdf`;

    try {
      // ── 1. Obtener URL firmada del adjunto ───────────────────────────────
      if (!att.id) {
        errors.push(`${filename}: adjunto sin id en el payload`);
        continue;
      }

      const downloadUrl = await getAttachmentDownloadUrl(email_id, att.id);
      if (!downloadUrl) {
        errors.push(`${filename}: no se pudo obtener download_url (id=${att.id})`);
        continue;
      }

      // ── 2. Descargar el PDF ──────────────────────────────────────────────
      const dlRes = await fetch(downloadUrl);
      if (!dlRes.ok) {
        errors.push(`${filename}: error descargando PDF desde CDN (status=${dlRes.status})`);
        continue;
      }
      const buf = Buffer.from(await dlRes.arrayBuffer());

      // ── 3. Validar MIME real ─────────────────────────────────────────────
      const validation = validateDocumentBuffer(buf, filename);
      if (!validation.ok || validation.detectedMime !== "application/pdf") {
        errors.push(`${filename}: ${validation.error ?? "no es un PDF válido"}`);
        continue;
      }

      // ── 4. Deduplicar por SHA-256 ────────────────────────────────────────
      const sha = sha256Hex(buf);
      const dupFile = await (prisma as any).storedFile.findFirst({
        where:  { sha256: sha, deletedAt: null },
        select: { id: true, invoices: { select: { id: true }, take: 1 } },
      });

      if (dupFile && (dupFile.invoices as any[]).length > 0) {
        console.log(`[inbound-invoice] ${filename}: duplicado, saltando`);
        continue;
      }

      // ── 5. Almacenar el archivo ──────────────────────────────────────────
      let storedFileId: string;
      if (dupFile) {
        storedFileId = dupFile.id;
      } else {
        const safeName = `inbound-${Date.now()}-${sanitizeFilename(filename)}`;
        const stored   = await storeFile("suppliers/invoices", safeName, buf);
        const sf = await (prisma as any).storedFile.create({
          data: {
            storageKey:   stored.storageKey,
            originalName: filename.slice(0, 255),
            mimeType:     "application/pdf",
            sizeBytes:    stored.sizeBytes,
            sha256:       sha,
            uploadedById: actor.id,
          },
        });
        storedFileId = sf.id;
      }

      // ── 6. Extracción IA (campos + CIF del emisor + desglose IVA) ────────
      let fields: Awaited<ReturnType<typeof extractInvoiceFields>> = {};
      try {
        fields = await extractInvoiceFields(buf, "application/pdf");
        console.log(`[inbound-invoice] IA extraído: CIF=${fields.supplierCif ?? "—"} nombre=${fields.supplierName ?? "—"} vatLines=${fields.vatLines?.length ?? 0}`);
      } catch (ocrErr: any) {
        console.warn(`[inbound-invoice] OCR falló (${filename}): ${ocrErr?.message}`);
      }

      // ── 7. Resolver proveedor por CIF ────────────────────────────────────
      const supplierId = await resolveSupplier(fields.supplierCif, fields.supplierName, actor.id);

      // ── 8. Calcular totales IVA ──────────────────────────────────────────
      const vatLines = fields.vatLines ?? [];
      const aggBase  = vatLines.length > 0
        ? vatLines.reduce((s, v) => s + v.baseAmountInCents, 0)
        : (fields.baseAmountInCents ?? null);
      const aggTax   = vatLines.length > 0
        ? vatLines.reduce((s, v) => s + v.taxInCents, 0)
        : (fields.vatAmountInCents ?? null);
      const aggRate  = vatLines.length === 1 ? (fields.vatRate ?? vatLines[0].vatRate) : null;

      const notes = [
        `Recibido por email de: ${fromEmail}`,
        subject ? `Asunto: ${subject}` : null,
      ].filter(Boolean).join(" · ");

      // ── 9. Crear factura ─────────────────────────────────────────────────
      await (prisma as any).invoice.create({
        data: {
          supplierId,
          invoiceNumber:     fields.invoiceNumber     ?? null,
          invoiceDate:       fields.invoiceDate       ? new Date(fields.invoiceDate) : new Date(),
          totalInCents:      fields.totalInCents      ?? 0,
          taxInCents:        aggTax,
          baseAmountInCents: aggBase,
          vatRate:           aggRate,
          isPaid:            false,
          ocrExtracted:      true,
          pendingReview:     true,
          notes,
          storedFileId,
          createdById:       actor.id,
          ...(vatLines.length > 0 ? {
            vatLines: {
              create: vatLines.map(vl => ({
                vatRate:           vl.vatRate,
                baseAmountInCents: vl.baseAmountInCents,
                taxInCents:        vl.taxInCents,
              })),
            },
          } : {}),
        },
      });

      console.log(`[inbound-invoice] ✅ Factura creada para ${filename} → supplierId=${supplierId}`);
      processed++;
    } catch (err: any) {
      console.error(`[inbound-invoice] Error procesando ${filename}:`, err);
      errors.push(`${filename}: ${err?.message ?? "error desconocido"}`);
    }
  }

  revalidatePath("/invoices");
  revalidatePath("/suppliers");

  return NextResponse.json({ ok: true, processed, errors });
}
