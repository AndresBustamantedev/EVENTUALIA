/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";
import { storeFile } from "@/core/storage/StorageProvider";
import { validateDocumentBuffer, sanitizeFilename, sha256Hex } from "@/modules/hr/lib/documentUtils";
import { extractInvoiceFields } from "@/lib/ocr/extractInvoiceFields";
import { extractInvoiceFieldsLocal } from "@/lib/ocr/extractInvoiceFieldsLocal";

// ── Extracción + almacenamiento de un solo PDF ─────────────────────────────

export interface VatLineExtracted {
  vatRate: number;
  baseAmountInCents: number;
  taxInCents: number;
}

export interface SingleExtractResult {
  error?:              string;
  storedFileId?:       string;
  fileName?:           string;
  invoiceNumber?:      string | null;
  invoiceDate?:        string | null;
  totalInCents?:       number | null;
  taxInCents?:         number | null;
  baseAmountInCents?:  number | null;
  vatRate?:            number | null;
  supplierName?:       string | null;
  supplierCif?:        string | null;
  vatLines?:           VatLineExtracted[];
}

/**
 * Modos de extracción:
 *   "ai"     → Claude API (predeterminado)
 *   "local"  → extractor local sin IA (regex sobre texto embebido del PDF)
 *   "manual" → almacena el archivo sin extraer nada
 */
export type ExtractionMode = "ai" | "local" | "manual";

/**
 * Recibe un PDF digital, lo almacena y extrae sus campos según el modo indicado.
 * Se llama una vez por archivo desde el cliente, que muestra progreso por archivo.
 */
export async function extractAndStoreInvoiceAction(
  formData: FormData
): Promise<SingleExtractResult> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Archivo inválido." };

  const buf = Buffer.from(await file.arrayBuffer());
  const validation = validateDocumentBuffer(buf, file.name);
  if (!validation.ok) return { error: validation.error };
  if (validation.detectedMime !== "application/pdf") return { error: "Solo se admiten PDFs." };

  // Almacenar archivo
  const safeName = `bulk-${Date.now()}-${sanitizeFilename(file.name)}`;
  let stored: { storageKey: string; sizeBytes: number };
  try {
    stored = await storeFile("suppliers/invoices", safeName, buf);
  } catch {
    return { error: "Error al almacenar el archivo." };
  }

  const sf = await (prisma as any).storedFile.create({
    data: {
      storageKey:   stored.storageKey,
      originalName: file.name.slice(0, 255),
      mimeType:     validation.detectedMime!,
      sizeBytes:    stored.sizeBytes,
      sha256:       sha256Hex(buf),
      uploadedById: actor.id,
    },
  });

  // Determinar modo
  const rawMode = formData.get("mode");
  const mode: ExtractionMode =
    rawMode === "local" ? "local" :
    rawMode === "manual" || formData.get("skipAI") === "true" ? "manual" :
    "ai";

  type Fields = Awaited<ReturnType<typeof extractInvoiceFields>>;
  let f: Fields = {};

  if (mode === "ai") {
    try {
      f = await extractInvoiceFields(buf, validation.detectedMime!);
    } catch {
      // El archivo se guardó; devolvemos campos vacíos para que el usuario los rellene
    }
  } else if (mode === "local") {
    try {
      f = extractInvoiceFieldsLocal(buf);
    } catch {
      // Fallback silencioso: campos vacíos
    }
  }
  // "manual": f queda vacío

  return {
    storedFileId:      sf.id,
    fileName:          file.name,
    invoiceNumber:     f.invoiceNumber     ?? null,
    invoiceDate:       f.invoiceDate       ?? null,
    totalInCents:      f.totalInCents      ?? null,
    taxInCents:        f.vatAmountInCents  ?? null,
    baseAmountInCents: f.baseAmountInCents ?? null,
    vatRate:           f.vatRate           ?? null,
    supplierName:      f.supplierName      ?? null,
    supplierCif:       f.supplierCif       ?? null,
    vatLines:          f.vatLines          ?? [],
  };
}

// ── Guardado masivo de facturas ────────────────────────────────────────────

export interface BulkSaveLine {
  supplierId:        string;
  storedFileId:      string;
  invoiceNumber:     string | null;
  invoiceDate:       string;
  totalInCents:      number;
  taxInCents:        number | null;
  baseAmountInCents: number | null;
  vatRate:           number | null;
  vatLines?:         VatLineExtracted[];
}

export interface BulkSaveResult {
  error?: string;
  count?: number;
}

export async function saveBulkInvoicesAction(
  lines: BulkSaveLine[]
): Promise<BulkSaveResult> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  if (!lines.length) return { error: "No hay facturas que guardar." };

  const affected = new Set<string>();
  let count = 0;

  for (const l of lines) {
    // Cuando hay múltiples tipos de IVA, sumar bases y cuotas de todas las líneas
    const lines_ = l.vatLines ?? [];
    const isMultiVat = lines_.length > 1;
    const aggBase = isMultiVat
      ? lines_.reduce((s, v) => s + v.baseAmountInCents, 0)
      : (l.baseAmountInCents ?? null);
    const aggTax = isMultiVat
      ? lines_.reduce((s, v) => s + v.taxInCents, 0)
      : (l.taxInCents ?? null);
    const aggVatRate = isMultiVat ? null : (l.vatRate ?? null);

    await (prisma as any).invoice.create({
      data: {
        supplierId:        l.supplierId,
        invoiceNumber:     l.invoiceNumber || null,
        invoiceDate:       new Date(l.invoiceDate),
        totalInCents:      l.totalInCents,
        taxInCents:        aggTax,
        baseAmountInCents: aggBase,
        vatRate:           aggVatRate,
        isPaid:            false,
        ocrExtracted:      true,
        notes:             "Importado desde PDF digital",
        storedFileId:      l.storedFileId,
        bundleId:          null,
        createdById:       actor.id,
        // Guardar desglose IVA por tipo en invoice_vat_lines
        ...(lines_.length > 0 ? {
          vatLines: {
            create: lines_.map(vl => ({
              vatRate:           vl.vatRate,
              baseAmountInCents: vl.baseAmountInCents,
              taxInCents:        vl.taxInCents,
            })),
          },
        } : {}),
      },
    });
    affected.add(l.supplierId);
    count++;
  }

  for (const sid of affected) revalidatePath(`/suppliers/${sid}`);
  revalidatePath("/financiero");
  return { count };
}
