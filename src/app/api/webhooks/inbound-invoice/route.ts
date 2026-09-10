/**
 * POST /api/webhooks/inbound-invoice
 *
 * Recibe el evento `email.received` de Resend Inbound Email.
 * Para cada adjunto PDF:
 *   1. Descarga el contenido vía la API de Resend (los adjuntos NO vienen en el payload)
 *   2. Valida el archivo, detecta duplicados por SHA-256
 *   3. Almacena el PDF y extrae campos con IA
 *   4. Crea la factura en el bucket "Sin asignar"
 *
 * Seguridad:
 *   - Endpoint público protegido con secreto en query param (?secret=…)
 *   - Solo procesa archivos que pasen validación de tipo MIME
 *   - Detecta duplicados por SHA-256 para evitar facturas repetidas
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { storeFile } from "@/core/storage/StorageProvider";
import { validateDocumentBuffer, sanitizeFilename, sha256Hex } from "@/modules/hr/lib/documentUtils";
import { extractInvoiceFields } from "@/lib/ocr/extractInvoiceFields";

// ── Helper: obtiene (o crea) el proveedor "Sin asignar" ─────────────────────

const UNASSIGNED_NAME = "Sin asignar";

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

// ── Tipos del payload de Resend ──────────────────────────────────────────────

interface ResendEmailReceivedData {
  email_id:   string;
  from:       string;
  to:         string[];
  subject?:   string;
  created_at: string;
}

interface ResendWebhookEvent {
  type:       string;
  created_at: string;
  data:       ResendEmailReceivedData;
}

interface ResendAttachmentMeta {
  id:           string;
  filename:     string;
  content_type: string;
  size:         number;
  download_url: string;
}

// ── Helper: llama a la API de Resend ────────────────────────────────────────

async function fetchResendAttachments(emailId: string): Promise<ResendAttachmentMeta[]> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY no configurada");

  const res = await fetch(`https://api.resend.com/emails/${emailId}/attachments`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API error ${res.status}: ${text}`);
  }

  const json = await res.json();
  // La respuesta es { data: [...] }
  return (json.data ?? json) as ResendAttachmentMeta[];
}

async function downloadAttachment(downloadUrl: string): Promise<Buffer> {
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error(`Error descargando adjunto: HTTP ${res.status}`);
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Verificar secreto en query param
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.INBOUND_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parsear body JSON de Resend
  let event: ResendWebhookEvent;
  try {
    event = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Solo procesamos el evento email.received
  if (event.type !== "email.received") {
    return NextResponse.json({ ok: true, skipped: "event_type_ignored" });
  }

  const { email_id, from: fromEmail, subject } = event.data;

  // 3. Obtener lista de adjuntos vía API de Resend
  let attachmentsMeta: ResendAttachmentMeta[];
  try {
    attachmentsMeta = await fetchResendAttachments(email_id);
  } catch (err: any) {
    console.error("[inbound-invoice] Error obteniendo adjuntos:", err);
    return NextResponse.json({ error: err?.message ?? "Error API Resend" }, { status: 502 });
  }

  const pdfMetas = attachmentsMeta.filter(a =>
    a.content_type?.toLowerCase().includes("pdf") ||
    a.filename?.toLowerCase().endsWith(".pdf")
  );

  if (pdfMetas.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, skipped: "no_pdf" });
  }

  // 4. Encontrar actor del sistema (primer usuario activo = administrador)
  const actor = await (prisma as any).user.findFirst({
    where:   { isActive: true },
    orderBy: { createdAt: "asc" },
    select:  { id: true },
  });
  if (!actor) {
    return NextResponse.json({ error: "No system user found" }, { status: 500 });
  }

  // 5. Obtener proveedor "Sin asignar"
  const supplierId = await getOrCreateUnassignedSupplierId(actor.id);

  let processed = 0;
  const errors: string[] = [];

  // 6. Procesar cada PDF
  for (const meta of pdfMetas) {
    const filename = meta.filename ?? `inbound-${Date.now()}.pdf`;

    try {
      // Descargar contenido del adjunto
      const buf = await downloadAttachment(meta.download_url);

      // Validar MIME real
      const validation = validateDocumentBuffer(buf, filename);
      if (!validation.ok || validation.detectedMime !== "application/pdf") {
        errors.push(`${filename}: ${validation.error ?? "no es un PDF válido"}`);
        continue;
      }

      // Comprobar duplicado por SHA-256
      const sha = sha256Hex(buf);
      const dupFile = await (prisma as any).storedFile.findFirst({
        where:  { sha256: sha, deletedAt: null },
        select: { id: true, invoices: { select: { id: true }, take: 1 } },
      });

      if (dupFile && (dupFile.invoices as any[]).length > 0) {
        // Ya existe una factura con este PDF — ignorar
        continue;
      }

      // Almacenar archivo (o reutilizar si existía sin factura vinculada)
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

      // Extracción IA
      let fields: Awaited<ReturnType<typeof extractInvoiceFields>> = {};
      try {
        fields = await extractInvoiceFields(buf, "application/pdf");
      } catch {
        // Fallback silencioso: la factura entra sin campos extraídos
      }

      // Calcular totales si hay múltiples líneas de IVA
      const vatLines = fields.vatLines ?? [];
      const aggBase  = vatLines.length > 0 ? vatLines.reduce((s, v) => s + v.baseAmountInCents, 0) : (fields.baseAmountInCents ?? null);
      const aggTax   = vatLines.length > 0 ? vatLines.reduce((s, v) => s + v.taxInCents,        0) : (fields.vatAmountInCents ?? null);
      const aggRate  = vatLines.length > 1  ? null : (fields.vatRate ?? null);

      const notes = [
        `Recibido por email de: ${fromEmail}`,
        subject ? `Asunto: ${subject}` : null,
      ].filter(Boolean).join(" · ");

      // Crear factura en "Sin asignar"
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

      processed++;
    } catch (err: any) {
      errors.push(`${filename}: ${err?.message ?? "error desconocido"}`);
    }
  }

  // 7. Invalidar caché
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${supplierId}`);

  return NextResponse.json({ ok: true, processed, errors });
}
