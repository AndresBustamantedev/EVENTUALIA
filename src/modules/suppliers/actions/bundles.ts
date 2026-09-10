/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";
import { storeFile, readFile } from "@/core/storage/StorageProvider";
import { validateDocumentBuffer, sanitizeFilename, sha256Hex } from "@/modules/hr/lib/documentUtils";
import { extractMayorLines } from "@/lib/ocr/extractMayorLines";
import type { VatLineExtracted } from "@/lib/ocr/extractMayorLines";
import { createBundleSchema } from "../lib/validators";
import type { BundleRow, BundleFormState } from "../types";

// ── Helpers ──────────────────────────────────────────────────────

function mapBundle(b: any): BundleRow {
  return {
    id: b.id,
    supplierId: b.supplierId,
    description: b.description,
    bundleDate: (b.bundleDate as Date).toISOString().split("T")[0],
    pageCount: b.pageCount,
    fileId: b.storedFileId,
    invoiceCount: b._count?.invoices ?? 0,
    createdAt: (b.createdAt as Date).toISOString(),
  };
}

// ── Listar / crear bundles ────────────────────────────────────────

export async function listBundles(supplierId: string): Promise<BundleRow[]> {
  await requirePermission("suppliers:read");
  const rows = await (prisma as any).invoiceBundle.findMany({
    where: { supplierId },
    include: { _count: { select: { invoices: true } } },
    orderBy: { bundleDate: "desc" },
  });
  return (rows as any[]).map(mapBundle);
}

export async function createBundleAction(
  _prev: BundleFormState,
  formData: FormData
): Promise<BundleFormState> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso para crear bundles." }; }

  const raw = {
    supplierId:  formData.get("supplierId") as string,
    description: (formData.get("description") as string) || undefined,
    bundleDate:  formData.get("bundleDate") as string,
    pageCount:   (formData.get("pageCount") as string) || undefined,
  };

  const parsed = createBundleSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }
  const d = parsed.data;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "El PDF del escáner es obligatorio." };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const validation = validateDocumentBuffer(buf, file.name);
  if (!validation.ok) return { error: validation.error };
  if (validation.detectedMime !== "application/pdf") {
    return { error: "Solo se admiten archivos PDF para bundles." };
  }

  const safeName = `bundle-${Date.now()}-${sanitizeFilename(file.name)}`;
  const stored = await storeFile("suppliers/bundles", safeName, buf);
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

  const bundle = await (prisma as any).invoiceBundle.create({
    data: {
      supplierId:   d.supplierId,
      description:  d.description || null,
      bundleDate:   new Date(d.bundleDate),
      pageCount:    d.pageCount ?? null,
      storedFileId: sf.id,
      createdById:  actor.id,
    },
  });

  revalidatePath(`/suppliers/${d.supplierId}`);
  return { success: true, bundleId: bundle.id };
}

/**
 * Vincula una factura existente a un bundle (o la desvincula con bundleId = null).
 */
export async function linkInvoiceToBundleAction(
  invoiceId: string,
  bundleId: string | null
): Promise<{ error?: string; success?: boolean }> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const inv = await (prisma as any).invoice.findUnique({
    where: { id: invoiceId },
    select: { supplierId: true },
  });
  if (!inv) return { error: "Factura no encontrada." };

  await (prisma as any).invoice.update({
    where: { id: invoiceId },
    data: { bundleId },
  });

  revalidatePath(`/suppliers/${inv.supplierId}`);
  return { success: true };
}

// ── Extracción IA de facturas desde un bundle ─────────────────────

export type { VatLineExtracted };

export interface ExtractedBundleLine {
  invoiceNumber:  string | null;
  amountInCents:  number | null;
  invoiceDate:    string | null;
  supplierName:   string | null;
  supplierCif:    string | null;
  vatLines:       VatLineExtracted[];
  lineItems: {
    rawDescription:   string;
    quantity:         number | null;
    unitPriceInCents: number | null;
    totalInCents:     number | null;
  }[];
}

export interface ExtractBundleResult {
  error?: string;
  lines?: ExtractedBundleLine[];
}

/** Lee el PDF del bundle y extrae las líneas de factura con Claude API. */
export async function extractBundleInvoicesAction(
  bundleId: string
): Promise<ExtractBundleResult> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const bundle = await (prisma as any).invoiceBundle.findUnique({
    where: { id: bundleId },
    include: { storedFile: true },
  });
  if (!bundle) return { error: "Bundle no encontrado." };

  let buf: Buffer;
  try {
    buf = await readFile(bundle.storedFile.storageKey);
  } catch {
    return { error: "No se pudo leer el archivo del servidor." };
  }

  try {
    const lines = await extractMayorLines(buf, bundle.storedFile.mimeType);
    // Map MayorLine to ExtractedBundleLine (includes vatLines breakdown)
    const mappedLines: ExtractedBundleLine[] = lines.map(l => ({
      invoiceNumber: l.invoiceNumber,
      amountInCents: l.amountInCents,
      invoiceDate:   l.invoiceDate,
      supplierName:  l.supplierName ?? null,
      supplierCif:   l.supplierCif ?? null,
      vatLines:      l.vatLines ?? [],
      lineItems:     l.lineItems,
    }));
    return { lines: mappedLines };
  } catch (err: any) {
    return { error: `Error al procesar con IA: ${err?.message ?? "desconocido"}` };
  }
}

export interface SaveExtractedState {
  error?:   string;
  success?: boolean;
  count?:   number;
}

export interface SaveExtractedLine {
  invoiceNumber:     string | null;
  amountInCents:     number;
  invoiceDate:       string;
  taxInCents:        number | null;
  baseAmountInCents: number | null;
  vatRate:           number | null;
  vatLines?:         VatLineExtracted[];
  /** supplierId resuelto por el usuario; si no se indica, se usa el del bundle */
  supplierId?:       string;
  lineItems: {
    rawDescription:   string;
    quantity:         number | null;
    unitPriceInCents: number | null;
    totalInCents:     number | null;
    /** productId resuelto por el usuario (null = nuevo producto) */
    productId:        string | null;
    /** nombre del nuevo producto (cuando productId === null y createOrder = true) */
    newProductName:   string | null;
  }[];
}

/**
 * Crea las facturas confirmadas por el usuario a partir de las líneas extraídas.
 * Si createOrder = true, además crea un Pedido con sus OrderItems por cada factura.
 * Los productos nuevos (productId === null) se crean automáticamente si se van a usar en pedidos.
 */
export async function saveExtractedInvoicesAction(
  bundleId:    string,
  supplierId:  string,
  lines:       SaveExtractedLine[],
  createOrder: boolean
): Promise<SaveExtractedState> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso para crear facturas." }; }

  if (!lines.length) return { error: "No hay facturas que guardar." };

  let savedCount = 0;

  for (const l of lines) {
    // 1. Calcular base/cuota/tipo desde desglose IVA o campos directos
    const vatLinesList = l.vatLines ?? [];
    const isMultiVat = vatLinesList.length > 1;
    const aggBase = vatLinesList.length > 0
      ? vatLinesList.reduce((s, v) => s + v.baseAmountInCents, 0)
      : (l.baseAmountInCents ?? null);
    const aggTax = vatLinesList.length > 0
      ? vatLinesList.reduce((s, v) => s + v.taxInCents, 0)
      : (l.taxInCents ?? null);
    const aggVatRate = (isMultiVat || vatLinesList.length === 0) ? (l.vatRate ?? null) : vatLinesList[0].vatRate;

    // 2. Crear la factura (usa el supplierId detectado por IA si el usuario lo confirmó)
    const effectiveSupplierId = l.supplierId ?? supplierId;
    const invoice = await (prisma as any).invoice.create({
      data: {
        supplierId:        effectiveSupplierId,
        bundleId,
        invoiceNumber:     l.invoiceNumber || null,
        invoiceDate:       new Date(l.invoiceDate),
        totalInCents:      l.amountInCents,
        taxInCents:        aggTax,
        baseAmountInCents: aggBase,
        vatRate:           aggVatRate,
        isPaid:            false,
        ocrExtracted:      true,
        notes:             "Extraído automáticamente por IA desde bundle",
        storedFileId:      null,
        createdById:       actor.id,
        // Guardar desglose IVA por tipo en invoice_vat_lines
        ...(vatLinesList.length > 0 ? {
          vatLines: {
            create: vatLinesList.map(vl => ({
              vatRate:           vl.vatRate,
              baseAmountInCents: vl.baseAmountInCents,
              taxInCents:        vl.taxInCents,
            })),
          },
        } : {}),
      },
    });
    savedCount++;

    // 3. Crear líneas de factura (InvoiceLine) si existen
    if (l.lineItems.length > 0) {
      for (const li of l.lineItems) {
        // Resolver productId: si es null pero se indica newProductName, crear producto
        let resolvedProductId: string | null = li.productId;

        if (createOrder && resolvedProductId === null && li.newProductName?.trim()) {
          // Buscar si ya existe un producto con ese nombre (por si hay duplicados en el bundle)
          const existing = await (prisma as any).product.findFirst({
            where: { name: { equals: li.newProductName.trim(), mode: "insensitive" } },
            select: { id: true },
          });
          if (existing) {
            resolvedProductId = existing.id;
          } else {
            const newProduct = await (prisma as any).product.create({
              data: {
                name:        li.newProductName.trim().slice(0, 200),
                isActive:    true,
                createdById: actor.id,
              },
            });
            resolvedProductId = newProduct.id;
          }
        }

        await (prisma as any).invoiceLine.create({
          data: {
            invoiceId:        invoice.id,
            rawDescription:   li.rawDescription.slice(0, 500),
            quantity:         li.quantity ?? null,
            unitPriceInCents: li.unitPriceInCents ?? null,
            totalInCents:     li.totalInCents ?? null,
            productId:        resolvedProductId,
          },
        });
      }
    }

    // 4. Si se pidió crear pedido, generar Order + OrderItems
    if (createOrder && l.lineItems.some((li) => li.productId || li.newProductName?.trim())) {
      // Reagrupar líneas con producto resuelto (releer desde DB para obtener productId actualizado)
      const savedLines = await (prisma as any).invoiceLine.findMany({
        where: { invoiceId: invoice.id, productId: { not: null } },
        select: { id: true, productId: true, rawDescription: true, quantity: true, unitPriceInCents: true },
      });

      if (savedLines.length > 0) {
        const order = await (prisma as any).order.create({
          data: {
            supplierId: effectiveSupplierId,

            orderDate:  new Date(l.invoiceDate),
            status:     "RECEIVED",
            notes:      `Generado automáticamente desde factura ${l.invoiceNumber ?? "sin número"}`,
            createdById: actor.id,
          },
        });

        for (const sl of savedLines as any[]) {
          await (prisma as any).orderItem.create({
            data: {
              orderId:     order.id,
              productId:   sl.productId,
              description: sl.rawDescription.slice(0, 500),
              quantity:    sl.quantity ?? 1,
              unitPrice:   sl.unitPriceInCents ?? 0,
            },
          });
        }
      }
    }
  }

  // Revalidar el proveedor del bundle y todos los proveedores afectados por reasignación
  const affectedIds = new Set([supplierId, ...lines.map(l => l.supplierId).filter(Boolean) as string[]]);
  for (const sid of affectedIds) revalidatePath(`/suppliers/${sid}`);
  revalidatePath("/financiero");
  return { success: true, count: savedCount };
}

// ── Eliminar bundle ────────────────────────────────────────────────────────

export interface DeleteBundleResult {
  error?: string;
  deletedInvoices?: number;
}

/**
 * Elimina un bundle y hace soft-delete de todas las facturas asociadas.
 * El archivo PDF en storage se mantiene; solo se borra el registro y sus facturas.
 */
export async function deleteBundleAction(
  bundleId: string
): Promise<DeleteBundleResult> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const bundle = await (prisma as any).invoiceBundle.findUnique({
    where: { id: bundleId },
    include: { invoices: { where: { deletedAt: null } } },
  });
  if (!bundle) return { error: "Bundle no encontrado." };

  const supplierId: string = bundle.supplierId;
  const invoiceCount: number = (bundle.invoices as any[]).length;

  // Soft-delete de todas las facturas del bundle
  if (invoiceCount > 0) {
    await (prisma as any).invoice.updateMany({
      where: { bundleId, deletedAt: null },
      data:  { deletedAt: new Date() },
    });
  }

  // Borrar el bundle
  await (prisma as any).invoiceBundle.delete({ where: { id: bundleId } });

  revalidatePath(`/suppliers/${supplierId}`);
  revalidatePath("/financiero");

  return { deletedInvoices: invoiceCount };
}

// ── Subida global de escáner (sin proveedor previo) ───────────────────────────

export interface UploadGlobalScanResult {
  error?:        string;
  storedFileId?: string;
  lines?:        ExtractedBundleLine[];
}

/**
 * Almacena el PDF, extrae las facturas con IA y devuelve el storedFileId + líneas.
 * NO crea InvoiceBundle todavía — eso ocurre en saveGlobalScansAction tras la revisión.
 */
export async function uploadGlobalScanAction(
  formData: FormData
): Promise<UploadGlobalScanResult> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecciona un archivo PDF." };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const validation = validateDocumentBuffer(buf, file.name);
  if (!validation.ok) return { error: validation.error };
  if (validation.detectedMime !== "application/pdf") {
    return { error: "Solo se admiten archivos PDF." };
  }

  const safeName = `scan-${Date.now()}-${sanitizeFilename(file.name)}`;
  const stored = await storeFile("suppliers/bundles", safeName, buf);
  const sha = sha256Hex(buf);

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

  try {
    const lines = await extractMayorLines(buf, validation.detectedMime!);
    const mappedLines: ExtractedBundleLine[] = lines.map(l => ({
      invoiceNumber: l.invoiceNumber,
      amountInCents: l.amountInCents,
      invoiceDate:   l.invoiceDate,
      supplierName:  l.supplierName ?? null,
      supplierCif:   l.supplierCif ?? null,
      vatLines:      l.vatLines ?? [],
      lineItems:     l.lineItems,
    }));
    return { storedFileId: sf.id, lines: mappedLines };
  } catch (err: any) {
    return { error: `Error al procesar con IA: ${err?.message ?? "desconocido"}` };
  }
}

export interface SaveGlobalScansResult {
  error?:   string;
  success?: boolean;
  count?:   number;
}

/**
 * Crea el InvoiceBundle bajo el proveedor mayoritario y guarda todas las facturas.
 * Cada factura lleva su propio supplierId (el elegido en la tabla de revisión).
 */
export async function saveGlobalScansAction(
  storedFileId: string,
  bundleDate:   string,
  lines:        SaveExtractedLine[],
  createOrder:  boolean
): Promise<SaveGlobalScansResult> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso para crear facturas." }; }

  if (!lines.length) return { error: "No hay facturas que guardar." };

  // Determinar proveedor mayoritario para asignar el bundle
  const supplierCounts = new Map<string, number>();
  for (const l of lines) {
    if (l.supplierId) {
      supplierCounts.set(l.supplierId, (supplierCounts.get(l.supplierId) ?? 0) + 1);
    }
  }
  if (supplierCounts.size === 0) {
    return { error: "Asigna al menos una factura a un proveedor antes de guardar." };
  }

  let bundleSupplierId = "";
  let maxCount = 0;
  for (const [sid, cnt] of supplierCounts) {
    if (cnt > maxCount) { maxCount = cnt; bundleSupplierId = sid; }
  }

  // Crear el bundle bajo el proveedor mayoritario
  const bundle = await (prisma as any).invoiceBundle.create({
    data: {
      supplierId:   bundleSupplierId,
      description:  "Escáner subido desde vista de facturas",
      bundleDate:   new Date(bundleDate),
      pageCount:    null,
      storedFileId: storedFileId,
      createdById:  actor.id,
    },
  });

  let savedCount = 0;

  for (const l of lines) {
    const effectiveSupplierId = l.supplierId ?? bundleSupplierId;
    const vatLinesList = l.vatLines ?? [];
    const isMultiVat = vatLinesList.length > 1;
    const aggBase = vatLinesList.length > 0
      ? vatLinesList.reduce((s, v) => s + v.baseAmountInCents, 0)
      : (l.baseAmountInCents ?? null);
    const aggTax = vatLinesList.length > 0
      ? vatLinesList.reduce((s, v) => s + v.taxInCents, 0)
      : (l.taxInCents ?? null);
    const aggVatRate = (isMultiVat || vatLinesList.length === 0)
      ? (l.vatRate ?? null)
      : vatLinesList[0].vatRate;

    const invoice = await (prisma as any).invoice.create({
      data: {
        supplierId:        effectiveSupplierId,
        bundleId:          bundle.id,
        invoiceNumber:     l.invoiceNumber || null,
        invoiceDate:       new Date(l.invoiceDate),
        totalInCents:      l.amountInCents,
        taxInCents:        aggTax,
        baseAmountInCents: aggBase,
        vatRate:           aggVatRate,
        isPaid:            false,
        ocrExtracted:      true,
        notes:             "Extraído automáticamente por IA desde escáner global",
        storedFileId:      null,
        createdById:       actor.id,
        ...(vatLinesList.length > 0 ? {
          vatLines: {
            create: vatLinesList.map(vl => ({
              vatRate:           vl.vatRate,
              baseAmountInCents: vl.baseAmountInCents,
              taxInCents:        vl.taxInCents,
            })),
          },
        } : {}),
      },
    });
    savedCount++;

    if (l.lineItems.length > 0) {
      for (const li of l.lineItems) {
        let resolvedProductId: string | null = li.productId;
        if (createOrder && resolvedProductId === null && li.newProductName?.trim()) {
          const existing = await (prisma as any).product.findFirst({
            where: { name: { equals: li.newProductName.trim(), mode: "insensitive" } },
            select: { id: true },
          });
          resolvedProductId = existing
            ? existing.id
            : (await (prisma as any).product.create({
                data: { name: li.newProductName.trim().slice(0, 200), isActive: true, createdById: actor.id },
              })).id;
        }
        await (prisma as any).invoiceLine.create({
          data: {
            invoiceId:        invoice.id,
            rawDescription:   li.rawDescription.slice(0, 500),
            quantity:         li.quantity ?? null,
            unitPriceInCents: li.unitPriceInCents ?? null,
            totalInCents:     li.totalInCents ?? null,
            productId:        resolvedProductId,
          },
        });
      }
    }

    if (createOrder && l.lineItems.some(li => li.productId || li.newProductName?.trim())) {
      const savedLines = await (prisma as any).invoiceLine.findMany({
        where: { invoiceId: invoice.id, productId: { not: null } },
        select: { id: true, productId: true, rawDescription: true, quantity: true, unitPriceInCents: true },
      });
      if ((savedLines as any[]).length > 0) {
        const order = await (prisma as any).order.create({
          data: {
            supplierId:  effectiveSupplierId,
            orderDate:   new Date(l.invoiceDate),
            status:      "RECEIVED",
            notes:       `Generado desde factura ${l.invoiceNumber ?? "sin número"}`,
            createdById: actor.id,
          },
        });
        for (const sl of savedLines as any[]) {
          await (prisma as any).orderItem.create({
            data: {
              orderId:     order.id,
              productId:   sl.productId,
              description: sl.rawDescription.slice(0, 500),
              quantity:    sl.quantity ?? 1,
              unitPrice:   sl.unitPriceInCents ?? 0,
            },
          });
        }
      }
    }
  }

  const affectedIds = new Set([bundleSupplierId, ...lines.map(l => l.supplierId).filter(Boolean) as string[]]);
  for (const sid of affectedIds) revalidatePath(`/suppliers/${sid}`);
  revalidatePath("/invoices");
  revalidatePath("/financiero");

  return { success: true, count: savedCount };
}
