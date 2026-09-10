/**
 * POST /api/webhooks/inbound-invoice
 *
 * Recibe emails entrantes de Resend Inbound Email.
 * Para cada adjunto PDF: almacena el archivo, extrae datos con IA
 * y crea la factura en el bucket "Sin asignar".
 *
 * Seguridad:
 *   - Endpoint público (sin sesión) pero protegido con un secreto en la URL.
 *   - Sólo procesa archivos que pasen la validación de tipo MIME.
 *   - Detecta duplicados por SHA-256 para evitar facturas repetidas.
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
    where: { name: UNASSIGNED_NAME, isActive: false },
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

// ── Payload de Resend Inbound Email ─────────────────────────────────────────
// https://resend.com/docs/api-reference/inbound/introduction

interface ResendAttachment {
  filename?:    string;
  content:      string;          // base64
  contentType?: string;
}

interface ResendInboundPayload {
  from?:        string;
  to?:          string[];
  subject?:     string;
  text?:        string;
  html?:        string;
  attachments?: ResendAttachment[];
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Verificar secreto en query param
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.INBOUND_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parsear body JSON de Resend
  let body: ResendInboundPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const attachments = body.attachments ?? [];
  const pdfAttachments = attachments.filter(a =>
    a.contentType?.toLowerCase().includes("pdf") ||
    a.filename?.toLowerCase().endsWith(".pdf")
  );

  if (pdfAttachments.length === 0) {
    // Email sin PDF adjunto — confirmamos recepción para que Resend no reintente
    return NextResponse.json({ ok: true, processed: 0, skipped: "no_pdf" });
  }

  // 3. Encontrar un actor del sistema (primer usuario creado = administrador)
  const actor = await (prisma as any).user.findFirst({
    orderBy: { createdAt: "asc" },
    select:  { id: true },
  });
  if (!actor) {
    return NextResponse.json({ error: "No system user found" }, { status: 500 });
  }

  // 4. Obtener proveedor "Sin asignar"
  const supplierId = await getOrCreateUnassignedSupplierId(actor.id);
  const fromEmail  = body.from ?? "desconocido";

  let processed = 0;
  const errors: string[] = [];

  // 5. Procesar cada PDF
  for (const att of pdfAttachments) {
    const filename = att.filename ?? `inbound-${Date.now()}.pdf`;

    try {
      const buf = Buffer.from(att.content, "base64");

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
          notes:             `Recibido por email de: ${fromEmail}`,
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

  // 6. Invalidar caché para que aparezca en /invoices inmediatamente
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${supplierId}`);

  return NextResponse.json({ ok: true, processed, errors });
}
