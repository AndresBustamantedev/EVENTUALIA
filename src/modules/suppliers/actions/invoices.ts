/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";
import { storeFile } from "@/core/storage/StorageProvider";
import {
  validateDocumentBuffer,
  sanitizeFilename,
  sha256Hex,
} from "@/modules/hr/lib/documentUtils";
import { createInvoiceSchema } from "../lib/validators";
import type { InvoiceRow, VatLineRow, InvoiceFormState } from "../types";

function mapInvoice(inv: any): InvoiceRow {
  const vatLines: VatLineRow[] = (inv.vatLines ?? []).map((vl: any) => ({
    vatRate: parseFloat(String(vl.vatRate)),
    baseAmountInCents: vl.baseAmountInCents,
    taxInCents: vl.taxInCents,
  }));

  // Gestoria status (only SENT/CONFIRMED packages)
  const gestoriaPkg = (inv.gestoriaItems as any[] | undefined)?.[0]?.package ?? null;

  return {
    id: inv.id,
    supplierId: inv.supplierId,
    supplierName: inv.supplier?.name ?? "",
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: (inv.invoiceDate as Date).toISOString().split("T")[0],
    dueDate: inv.dueDate ? (inv.dueDate as Date).toISOString().split("T")[0] : null,
    totalInCents: inv.totalInCents,
    taxInCents: inv.taxInCents,
    baseAmountInCents: inv.baseAmountInCents ?? null,
    vatRate: inv.vatRate ? parseFloat(String(inv.vatRate)) : null,
    vatLines,
    isPaid: inv.isPaid,
    paidAt: inv.paidAt ? (inv.paidAt as Date).toISOString() : null,
    notes: inv.notes,
    fileId: inv.storedFileId ?? null,
    bundleId: inv.bundleId ?? null,
    bundleDate: inv.bundle?.bundleDate ? (inv.bundle.bundleDate as Date).toISOString().split("T")[0] : null,
    bundleFileId: inv.bundle?.storedFileId ?? null,
    createdAt: (inv.createdAt as Date).toISOString(),
    gestoriaPackageId:      gestoriaPkg?.id ?? null,
    gestoriaPackageYear:    gestoriaPkg?.year ?? null,
    gestoriaPackageQuarter: gestoriaPkg?.quarter ?? null,
    gestoriaStatus:         (gestoriaPkg?.status as "SENT" | "CONFIRMED" | null) ?? null,
  };
}

const INVOICE_INCLUDE = {
  supplier: { select: { name: true } },
  bundle: { select: { bundleDate: true, storedFileId: true } },
  vatLines: { select: { vatRate: true, baseAmountInCents: true, taxInCents: true } },
  gestoriaItems: {
    where:   { package: { status: { in: ["SENT", "CONFIRMED"] } } },
    take:    1,
    orderBy: { addedAt: "desc" as const },
    select:  { package: { select: { id: true, status: true, quarter: true, year: true } } },
  },
};

export async function listInvoices(supplierId?: string): Promise<InvoiceRow[]> {
  await requirePermission("suppliers:read");
  const rows = await (prisma as any).invoice.findMany({
    where: {
      ...(supplierId ? { supplierId } : {}),
      deletedAt: null,
    },
    include: INVOICE_INCLUDE,
    orderBy: { invoiceDate: "desc" },
  });
  return (rows as any[]).map(mapInvoice);
}

// ── Parsear líneas de IVA del FormData ──────────────────────
// Formato: vatLine_0_rate, vatLine_0_base, vatLine_0_tax, vatLine_1_rate, ...
function parseVatLinesFromForm(formData: FormData): VatLineRow[] {
  const lines: VatLineRow[] = [];
  let i = 0;
  while (formData.has(`vatLine_${i}_rate`)) {
    const rate = parseFloat(formData.get(`vatLine_${i}_rate`) as string);
    const base = parseInt(formData.get(`vatLine_${i}_base`) as string, 10);
    const tax  = parseInt(formData.get(`vatLine_${i}_tax`) as string, 10);
    if (!isNaN(rate) && !isNaN(base) && !isNaN(tax)) {
      lines.push({ vatRate: rate, baseAmountInCents: base, taxInCents: tax });
    }
    i++;
  }
  return lines;
}

export async function createInvoiceAction(
  _prev: InvoiceFormState,
  formData: FormData
): Promise<InvoiceFormState> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso para registrar facturas." }; }

  const raw = {
    supplierId: formData.get("supplierId") as string,
    invoiceNumber: (formData.get("invoiceNumber") as string) || undefined,
    invoiceDate: formData.get("invoiceDate") as string,
    dueDate: (formData.get("dueDate") as string) || null,
    totalInCents: formData.get("totalInCents") as string,
    taxInCents: (formData.get("taxInCents") as string) || undefined,
    baseAmountInCents: (formData.get("baseAmountInCents") as string) || undefined,
    vatRate: (formData.get("vatRate") as string) || undefined,
    notes: (formData.get("notes") as string) || undefined,
    isPaid: (formData.get("isPaid") as string) || "false",
  };
  const ocrExtracted = formData.get("ocrExtracted") === "true";
  const bundleId = (formData.get("bundleId") as string) || null;
  const vatLines = parseVatLinesFromForm(formData);

  const parsed = createInvoiceSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }
  const d = parsed.data;

  // Si hay vatLines, calcular base y tax totales para los campos legacy
  const totalBase = vatLines.length > 0
    ? vatLines.reduce((s, l) => s + l.baseAmountInCents, 0)
    : (d.baseAmountInCents ?? null);
  const totalTax = vatLines.length > 0
    ? vatLines.reduce((s, l) => s + l.taxInCents, 0)
    : (d.taxInCents ?? null);
  // vatRate legacy = tipo predominante (el de mayor base)
  const legacyRate = vatLines.length > 0
    ? vatLines.reduce((a, b) => a.baseAmountInCents >= b.baseAmountInCents ? a : b).vatRate
    : (d.vatRate ? parseFloat(String(d.vatRate)) : null);

  // Archivo PDF opcional
  let storedFileId: string | null = null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const buf = Buffer.from(await file.arrayBuffer());
    const validation = validateDocumentBuffer(buf, file.name);
    if (!validation.ok) return { error: validation.error };

    const safeName = `invoice-${Date.now()}-${sanitizeFilename(file.name)}`;
    const stored = await storeFile("suppliers/invoices", safeName, buf);
    const sha = sha256Hex(buf);

    const sf = await (prisma as any).storedFile.create({
      data: {
        storageKey: stored.storageKey,
        originalName: file.name.slice(0, 255),
        mimeType: validation.detectedMime!,
        sizeBytes: stored.sizeBytes,
        sha256: sha,
        uploadedById: actor.id,
      },
    });
    storedFileId = sf.id;
  }

  const invoice = await (prisma as any).invoice.create({
    data: {
      supplierId: d.supplierId,
      invoiceNumber: d.invoiceNumber || null,
      invoiceDate: new Date(d.invoiceDate),
      dueDate: d.dueDate && d.dueDate !== "" ? new Date(d.dueDate) : null,
      totalInCents: d.totalInCents,
      taxInCents: totalTax,
      baseAmountInCents: totalBase,
      vatRate: legacyRate,
      notes: d.notes || null,
      isPaid: d.isPaid ?? false,
      ocrExtracted,
      bundleId,
      storedFileId,
      createdById: actor.id,
      ...(vatLines.length > 0 ? {
        vatLines: {
          create: vatLines.map(l => ({
            vatRate: l.vatRate,
            baseAmountInCents: l.baseAmountInCents,
            taxInCents: l.taxInCents,
          })),
        },
      } : {}),
    },
  });

  revalidatePath(`/suppliers/${d.supplierId}`);
  return { success: true, invoiceId: invoice.id };
}

export async function markInvoicePaidAction(
  invoiceId: string,
  paid: boolean
): Promise<{ error?: string; success?: boolean }> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const inv = await (prisma as any).invoice.findUnique({
    where: { id: invoiceId },
    select: { supplierId: true, deletedAt: true },
  });
  if (!inv || inv.deletedAt) return { error: "Factura no encontrada." };

  await (prisma as any).invoice.update({
    where: { id: invoiceId },
    data: { isPaid: paid, paidAt: paid ? new Date() : null },
  });

  revalidatePath(`/suppliers/${inv.supplierId}`);
  revalidatePath(`/invoices`);
  revalidatePath(`/invoices/${inv.supplierId}`);
  return { success: true };
}

export async function uploadInvoiceAction(
  _prev: InvoiceFormState,
  formData: FormData
): Promise<InvoiceFormState> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso para registrar facturas." }; }

  const supplierId   = formData.get("supplierId")   as string;
  const invoiceDate  = formData.get("invoiceDate")  as string;
  const invoiceNumber = (formData.get("invoiceNumber") as string) || null;
  const totalEuros   = (formData.get("totalEuros")  as string) || "";
  const totalInCents = totalEuros ? Math.round(parseFloat(totalEuros.replace(",", ".")) * 100) : 0;
  const forceCreate  = formData.get("forceCreate") === "true";

  if (!supplierId || !invoiceDate) {
    return { error: "Proveedor y fecha son obligatorios." };
  }

  if (invoiceNumber && !forceCreate) {
    const dup = await (prisma as any).invoice.findFirst({
      where: { supplierId, invoiceNumber, deletedAt: null },
      select: { id: true },
    });
    if (dup) {
      return { error: `DUPLICATE:Ya existe una factura con número "${invoiceNumber}" para este proveedor. ¿Deseas registrarla igualmente?` };
    }
  }

  let storedFileId: string | null = null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const buf = Buffer.from(await file.arrayBuffer());
    const validation = validateDocumentBuffer(buf, file.name);
    if (!validation.ok) return { error: validation.error };
    const safeName = `invoice-${Date.now()}-${sanitizeFilename(file.name)}`;
    const stored   = await storeFile("suppliers/invoices", safeName, buf);
    const sha      = sha256Hex(buf);
    const sf = await (prisma as any).storedFile.create({
      data: {
        storageKey: stored.storageKey,
        originalName: file.name.slice(0, 255),
        mimeType: validation.detectedMime!,
        sizeBytes: stored.sizeBytes,
        sha256: sha,
        uploadedById: actor.id,
      },
    });
    storedFileId = sf.id;
  }

  const invoice = await (prisma as any).invoice.create({
    data: {
      supplierId,
      invoiceNumber,
      invoiceDate:  new Date(invoiceDate),
      totalInCents: totalInCents || 0,
      isPaid:       false,
      ocrExtracted: false,
      storedFileId,
      createdById:  actor.id,
    },
  });

  await (prisma as any).auditLog.create({
    data: {
      actorId:    actor.id,
      action:     "INVOICE_UPLOAD",
      targetType: "invoice",
      targetId:   invoice.id,
      metadata:   { supplierId, invoiceNumber: invoiceNumber ?? null },
    },
  });

  revalidatePath(`/suppliers/${supplierId}`);
  revalidatePath(`/invoices`);
  revalidatePath(`/invoices/${supplierId}`);
  return { success: true, invoiceId: invoice.id };
}

export async function deleteInvoiceAction(
  invoiceId: string
): Promise<{ error?: string; success?: boolean }> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const inv = await (prisma as any).invoice.findUnique({
    where: { id: invoiceId },
    select: { supplierId: true, deletedAt: true },
  });
  if (!inv || inv.deletedAt) return { error: "Factura no encontrada." };

  await (prisma as any).invoice.update({
    where: { id: invoiceId },
    data: { deletedAt: new Date() },
  });

  revalidatePath(`/suppliers/${inv.supplierId}`);
  revalidatePath(`/invoices`);
  revalidatePath(`/invoices/${inv.supplierId}`);
  return { success: true };
}

export interface UpdateInvoicePayload {
  invoiceId:      string;
  invoiceNumber:  string | null;
  invoiceDate:    string;
  dueDate:        string | null;
  totalInCents:   number;
  taxInCents:     number | null;
  notes:          string | null;
  isPaid:         boolean;
  vatLines?:      VatLineRow[];
}

export async function updateInvoiceAction(
  payload: UpdateInvoicePayload
): Promise<{ error?: string; success?: boolean }> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const inv = await (prisma as any).invoice.findUnique({
    where: { id: payload.invoiceId },
    select: { supplierId: true, deletedAt: true, isPaid: true },
  });
  if (!inv || inv.deletedAt) return { error: "Factura no encontrada." };

  const paidAt = payload.isPaid && !inv.isPaid ? new Date() : (!payload.isPaid ? null : undefined);

  // Si vienen vatLines, calcular totales legacy y reemplazar las líneas
  const vatLines = payload.vatLines ?? [];
  const totalBase = vatLines.length > 0 ? vatLines.reduce((s, l) => s + l.baseAmountInCents, 0) : null;
  const legacyRate = vatLines.length > 0
    ? vatLines.reduce((a, b) => a.baseAmountInCents >= b.baseAmountInCents ? a : b).vatRate
    : null;

  await (prisma as any).invoice.update({
    where: { id: payload.invoiceId },
    data: {
      invoiceNumber: payload.invoiceNumber || null,
      invoiceDate:   new Date(payload.invoiceDate),
      dueDate:       payload.dueDate ? new Date(payload.dueDate) : null,
      totalInCents:  payload.totalInCents,
      taxInCents:    vatLines.length > 0
        ? vatLines.reduce((s, l) => s + l.taxInCents, 0)
        : payload.taxInCents,
      baseAmountInCents: totalBase,
      vatRate: legacyRate,
      notes:         payload.notes || null,
      isPaid:        payload.isPaid,
      ...(paidAt !== undefined ? { paidAt } : {}),
      ...(vatLines.length > 0 ? {
        vatLines: {
          deleteMany: {},
          create: vatLines.map(l => ({
            vatRate: l.vatRate,
            baseAmountInCents: l.baseAmountInCents,
            taxInCents: l.taxInCents,
          })),
        },
      } : {}),
    },
  });

  revalidatePath(`/suppliers/${inv.supplierId}`);
  revalidatePath(`/invoices`);
  revalidatePath(`/invoices/${inv.supplierId}`);
  return { success: true };
}

export async function getInvoiceLinesAction(invoiceId: string): Promise<import("../types").InvoiceLineRow[]> {
  await requirePermission("suppliers:read");
  const rows = await (prisma as any).invoiceLine.findMany({
    where: { invoiceId },
    include: { product: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return (rows as any[]).map((r: any) => ({
    id: r.id,
    invoiceId: r.invoiceId,
    rawDescription: r.rawDescription,
    quantity: r.quantity != null ? parseFloat(String(r.quantity)) : null,
    unitPriceInCents: r.unitPriceInCents ?? null,
    totalInCents: r.totalInCents ?? null,
    productId: r.productId ?? null,
    productName: r.product?.name ?? null,
  }));
}

export async function reassignInvoiceAction(
  invoiceId: string,
  newSupplierId: string,
): Promise<{ error?: string; success?: boolean }> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const inv = await (prisma as any).invoice.findUnique({
    where: { id: invoiceId },
    select: { supplierId: true, deletedAt: true },
  });
  if (!inv || inv.deletedAt) return { error: "Factura no encontrada." };

  await (prisma as any).invoice.update({
    where: { id: invoiceId },
    data: { supplierId: newSupplierId },
  });

  revalidatePath(`/invoices`);
  revalidatePath(`/invoices/${inv.supplierId}`);
  revalidatePath(`/invoices/${newSupplierId}`);
  return { success: true };
}
