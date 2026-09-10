/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";
import { storeFile } from "@/core/storage/StorageProvider";
import { validateDocumentBuffer, sanitizeFilename, sha256Hex } from "@/modules/hr/lib/documentUtils";
import { extractMayorLines, type MayorLine } from "@/lib/ocr/extractMayorLines";
import type { InvoiceRow } from "@/modules/suppliers/types";

// ── Tipos de reconciliación ─────────────────────────────────────

export interface MayorRow {
  id:          string;
  supplierId:  string;
  supplierName: string;
  year:        number;
  quarter:     number;
  fileId:      string;
  lineCount:   number;
  notes:       string | null;
  createdAt:   string;
}

export interface ReconciliationLine {
  invoiceNumber: string | null;
  mayorAmount:   number | null;   // céntimos en el mayor
  appAmount:     number | null;   // céntimos en la app
  mayorDate:     string | null;
  appDate:       string | null;
  appInvoiceId:  string | null;
  status:        "matched" | "only_mayor" | "only_app";
  amountDiff:    number | null;   // mayorAmount - appAmount (si ambos existen)
}

export interface ReconciliationResult {
  mayor:     MayorRow | null;
  lines:     ReconciliationLine[];
  summary: {
    matched:   number;
    onlyMayor: number;
    onlyApp:   number;
    totalDiff: number;  // suma de |diff| en céntimos
  };
}

export interface MayorUploadState {
  error?:   string;
  success?: boolean;
  mayorId?: string;
}

// ── Helpers ─────────────────────────────────────────────────────

function quarterDateRange(year: number, quarter: number): { gte: Date; lte: Date } {
  const startMonth = (quarter - 1) * 3; // 0,3,6,9
  const endMonth   = startMonth + 2;
  const gte = new Date(year, startMonth, 1);
  const lte = new Date(year, endMonth + 1, 0, 23, 59, 59); // último día del mes
  return { gte, lte };
}

function mapMayor(m: any): MayorRow {
  const lines = Array.isArray(m.extractedLines) ? m.extractedLines : [];
  return {
    id:           m.id,
    supplierId:   m.supplierId,
    supplierName: m.supplier?.name ?? "",
    year:         m.year,
    quarter:      m.quarter,
    fileId:       m.storedFileId,
    lineCount:    lines.length,
    notes:        m.notes ?? null,
    createdAt:    (m.createdAt as Date).toISOString(),
  };
}

// ── Actions ─────────────────────────────────────────────────────

/** Sube un mayor de proveedor, extrae las líneas y guarda el registro. */
export async function uploadMayorAction(
  _prev: MayorUploadState,
  formData: FormData
): Promise<MayorUploadState> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso para subir documentos de reconciliación." }; }

  const supplierId = (formData.get("supplierId") as string)?.trim();
  const yearStr    = (formData.get("year") as string)?.trim();
  const quarterStr = (formData.get("quarter") as string)?.trim();
  const notes      = (formData.get("notes") as string)?.trim() || null;
  const file       = formData.get("file");

  if (!supplierId) return { error: "Selecciona un proveedor." };
  const year    = parseInt(yearStr, 10);
  const quarter = parseInt(quarterStr, 10);
  if (isNaN(year) || year < 2020 || year > 2100)    return { error: "Año no válido." };
  if (isNaN(quarter) || quarter < 1 || quarter > 4) return { error: "Trimestre no válido." };
  if (!(file instanceof File) || file.size === 0)    return { error: "Selecciona un archivo (PDF o imagen)." };

  const buf = Buffer.from(await file.arrayBuffer());
  const validation = validateDocumentBuffer(buf, file.name);
  if (!validation.ok) return { error: validation.error };

  // Extraer líneas con Claude
  let lines: MayorLine[];
  try {
    lines = await extractMayorLines(buf, validation.detectedMime!);
  } catch (err: any) {
    return { error: `Error al procesar el documento: ${err?.message ?? "desconocido"}` };
  }

  // Guardar archivo
  const safeName = `mayor-${supplierId}-${year}-q${quarter}-${Date.now()}-${sanitizeFilename(file.name)}`;
  const stored   = await storeFile("suppliers/mayors", safeName, buf);
  const sha      = sha256Hex(buf);

  const sf = await (prisma as any).storedFile.create({
    data: {
      storageKey:   stored.storageKey,
      originalName: file.name.slice(0, 255),
      mimeType:     validation.detectedMime!,
      sizeBytes:    stored.sizeBytes,
      sha256:       sha,
      uploadedById: actor.id,
    },
  });

  // Upsert del mayor (un solo mayor por proveedor+año+trimestre)
  const mayor = await (prisma as any).supplierMayor.upsert({
    where: { supplierId_year_quarter: { supplierId, year, quarter } },
    create: {
      supplierId,
      year,
      quarter,
      storedFileId:   sf.id,
      extractedLines: lines,
      notes,
      createdById: actor.id,
    },
    update: {
      storedFileId:   sf.id,
      extractedLines: lines,
      notes,
    },
  });

  revalidatePath("/financiero/reconciliacion");
  return { success: true, mayorId: mayor.id };
}

/** Calcula la reconciliación entre el mayor subido y las facturas registradas en la app. */
export async function getReconciliation(
  supplierId: string,
  year: number,
  quarter: number
): Promise<ReconciliationResult> {
  await requirePermission("suppliers:read");

  const [mayorRecord, invoices] = await Promise.all([
    (prisma as any).supplierMayor.findUnique({
      where: { supplierId_year_quarter: { supplierId, year, quarter } },
      include: { supplier: { select: { name: true } } },
    }),
    (prisma as any).invoice.findMany({
      where: {
        supplierId,
        invoiceDate: quarterDateRange(year, quarter),
      },
      orderBy: { invoiceDate: "asc" },
    }),
  ]);

  if (!mayorRecord) {
    // Sin mayor: solo mostramos las facturas de la app como "only_app"
    const lines: ReconciliationLine[] = (invoices as any[]).map((inv) => ({
      invoiceNumber: inv.invoiceNumber ?? null,
      mayorAmount:   null,
      appAmount:     inv.totalInCents,
      mayorDate:     null,
      appDate:       (inv.invoiceDate as Date).toISOString().split("T")[0],
      appInvoiceId:  inv.id,
      status:        "only_app" as const,
      amountDiff:    null,
    }));
    return {
      mayor: null,
      lines,
      summary: { matched: 0, onlyMayor: 0, onlyApp: lines.length, totalDiff: 0 },
    };
  }

  const mayorLines: MayorLine[] = Array.isArray(mayorRecord.extractedLines)
    ? mayorRecord.extractedLines
    : [];

  // Índice de facturas en la app por número de factura normalizado
  const appByNumber = new Map<string, any>();
  const appWithoutNumber: any[] = [];
  for (const inv of invoices as any[]) {
    const num = inv.invoiceNumber?.trim().toLowerCase();
    if (num) appByNumber.set(num, inv);
    else appWithoutNumber.push(inv);
  }

  const result: ReconciliationLine[] = [];
  const matchedAppIds = new Set<string>();

  for (const ml of mayorLines) {
    const num = ml.invoiceNumber?.trim().toLowerCase();
    const appInv = num ? appByNumber.get(num) : undefined;

    if (appInv) {
      matchedAppIds.add(appInv.id);
      const diff = (ml.amountInCents ?? 0) - appInv.totalInCents;
      result.push({
        invoiceNumber: ml.invoiceNumber,
        mayorAmount:   ml.amountInCents,
        appAmount:     appInv.totalInCents,
        mayorDate:     ml.invoiceDate,
        appDate:       (appInv.invoiceDate as Date).toISOString().split("T")[0],
        appInvoiceId:  appInv.id,
        status:        "matched",
        amountDiff:    diff,
      });
    } else {
      result.push({
        invoiceNumber: ml.invoiceNumber,
        mayorAmount:   ml.amountInCents,
        appAmount:     null,
        mayorDate:     ml.invoiceDate,
        appDate:       null,
        appInvoiceId:  null,
        status:        "only_mayor",
        amountDiff:    null,
      });
    }
  }

  // Facturas en la app que NO aparecen en el mayor
  for (const inv of invoices as any[]) {
    if (!matchedAppIds.has(inv.id)) {
      result.push({
        invoiceNumber: inv.invoiceNumber ?? null,
        mayorAmount:   null,
        appAmount:     inv.totalInCents,
        mayorDate:     null,
        appDate:       (inv.invoiceDate as Date).toISOString().split("T")[0],
        appInvoiceId:  inv.id,
        status:        "only_app",
        amountDiff:    null,
      });
    }
  }

  const matched   = result.filter((r) => r.status === "matched").length;
  const onlyMayor = result.filter((r) => r.status === "only_mayor").length;
  const onlyApp   = result.filter((r) => r.status === "only_app").length;
  const totalDiff = result.reduce((acc, r) => acc + Math.abs(r.amountDiff ?? 0), 0);

  return {
    mayor: mapMayor(mayorRecord),
    lines: result,
    summary: { matched, onlyMayor, onlyApp, totalDiff },
  };
}

/** Lista todos los mayores subidos, agrupables por proveedor. */
export async function listMayors(): Promise<MayorRow[]> {
  await requirePermission("suppliers:read");
  const rows = await (prisma as any).supplierMayor.findMany({
    include: { supplier: { select: { name: true } } },
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
  });
  return (rows as any[]).map(mapMayor);
}

/** Devuelve el mayor para un proveedor+año+trimestre, o null si no existe. */
export async function getMayorForQuarter(
  supplierId: string,
  year: number,
  quarter: number
): Promise<MayorRow | null> {
  await requirePermission("suppliers:read");
  const m = await (prisma as any).supplierMayor.findUnique({
    where: { supplierId_year_quarter: { supplierId, year, quarter } },
    include: { supplier: { select: { name: true } } },
  });
  return m ? mapMayor(m) : null;
}

/** Lista las facturas registradas en la app para un proveedor y trimestre. */
export async function getAppInvoicesForQuarter(
  supplierId: string,
  year: number,
  quarter: number
): Promise<InvoiceRow[]> {
  await requirePermission("suppliers:read");
  const rows = await (prisma as any).invoice.findMany({
    where: {
      supplierId,
      invoiceDate: quarterDateRange(year, quarter),
    },
    include: { supplier: { select: { name: true } } },
    orderBy: { invoiceDate: "asc" },
  });
  return (rows as any[]).map((inv: any) => ({
    id:            inv.id,
    supplierId:    inv.supplierId,
    supplierName:  inv.supplier?.name ?? "",
    invoiceNumber: inv.invoiceNumber,
    invoiceDate:   (inv.invoiceDate as Date).toISOString().split("T")[0],
    dueDate:       inv.dueDate ? (inv.dueDate as Date).toISOString().split("T")[0] : null,
    totalInCents:  inv.totalInCents,
    taxInCents:    inv.taxInCents,
    isPaid:        inv.isPaid,
    paidAt:        inv.paidAt ? (inv.paidAt as Date).toISOString() : null,
    notes:         inv.notes,
    fileId:        inv.storedFileId ?? null,
    baseAmountInCents: inv.baseAmountInCents ?? null,
    vatRate:       inv.vatRate ? parseFloat(String(inv.vatRate)) : null,
    vatLines:      [],
    bundleId:      inv.bundleId ?? null,
    bundleDate:    null,
    bundleFileId:  null,
    createdAt:     (inv.createdAt as Date).toISOString(),
  }));
}
