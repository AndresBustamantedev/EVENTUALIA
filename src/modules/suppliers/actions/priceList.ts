/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";
import { storeFile } from "@/core/storage/StorageProvider";
import { validateDocumentBuffer, sanitizeFilename } from "@/modules/hr/lib/documentUtils";
import { extractPriceList, type PriceListItem } from "@/lib/ocr/extractPriceList";
import type { SupplierProductRow } from "../types";

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface ExtractedPriceItem extends PriceListItem {
  /** id del SupplierProduct existente si ya existe este producto en este proveedor */
  existingSupplierProductId: string | null;
  /** id del Product existente si el producto ya está en el catálogo global */
  existingProductId: string | null;
  /** true si el product name coincide exactamente con uno ya registrado */
  isExactMatch: boolean;
}

export interface ExtractPriceListResult {
  error?: string;
  items?: ExtractedPriceItem[];
}

export interface SavePriceListState {
  error?: string;
  success?: boolean;
  created?: number;
  updated?: number;
}

// ── Extraer tarifa con IA ─────────────────────────────────────────────────────

export async function extractPriceListAction(
  supplierId: string,
  formData: FormData
): Promise<ExtractPriceListResult> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecciona un archivo PDF o imagen." };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const validation = validateDocumentBuffer(buf, file.name);
  if (!validation.ok) return { error: validation.error };

  let items: PriceListItem[];
  try {
    items = await extractPriceList(buf, validation.detectedMime!);
  } catch (err: any) {
    return { error: `Error IA: ${err?.message ?? "desconocido"}` };
  }

  if (items.length === 0) {
    return { error: "La IA no detectó ningún producto. Comprueba la calidad del documento." };
  }

  // Cargar productos y SupplierProducts existentes para hacer matching
  const [allProducts, existingSPs] = await Promise.all([
    (prisma as any).product.findMany({ select: { id: true, name: true } }),
    (prisma as any).supplierProduct.findMany({
      where: { supplierId, isActive: true },
      select: { id: true, productId: true },
    }),
  ]);

  const productsByNameLower = new Map<string, string>(); // name.toLowerCase() → id
  for (const p of allProducts as any[]) {
    productsByNameLower.set((p.name as string).toLowerCase(), p.id as string);
  }
  const spByProductId = new Map<string, string>(); // productId → supplierProductId
  for (const sp of existingSPs as any[]) {
    spByProductId.set(sp.productId as string, sp.id as string);
  }

  const enriched: ExtractedPriceItem[] = items.map(item => {
    const nameLower = item.productName.toLowerCase();
    const existingProductId = productsByNameLower.get(nameLower) ?? null;
    const existingSupplierProductId = existingProductId ? (spByProductId.get(existingProductId) ?? null) : null;
    return {
      ...item,
      existingProductId,
      existingSupplierProductId,
      isExactMatch: existingProductId !== null,
    };
  });

  return { items: enriched };
}

// ── Guardar tarifa extraída ───────────────────────────────────────────────────

export interface SavePriceLineInput {
  productName:     string;
  presentation:    string;
  quantity:        number;
  unit:            string | null;
  priceInCents:    number;
  reference:       string | null;
  category:        string | null;
  existingProductId:        string | null;
  existingSupplierProductId: string | null;
}

export async function savePriceListAction(
  supplierId: string,
  lines: SavePriceLineInput[]
): Promise<SavePriceListState> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  if (!lines.length) return { error: "No hay productos que guardar." };

  let created = 0;
  let updated = 0;
  const now = new Date();

  for (const line of lines) {
    if (!line.productName.trim() || !line.priceInCents) continue;

    // 1. Resolver Product: usar existente o crear nuevo
    let productId = line.existingProductId;
    if (!productId) {
      const newProduct = await (prisma as any).product.create({
        data: {
          name:      line.productName.trim().slice(0, 200),
          category:  line.category?.trim().slice(0, 100) || null,
          unit:      line.unit?.trim().slice(0, 20) || null,
          isActive:  true,
          createdById: actor.id,
        },
      });
      productId = newProduct.id;
    }

    // 2. Crear o actualizar SupplierProduct
    if (line.existingSupplierProductId) {
      await (prisma as any).supplierProduct.update({
        where: { id: line.existingSupplierProductId },
        data: {
          presentation:   line.presentation.trim().slice(0, 200),
          quantity:       line.quantity,
          priceInCents:   line.priceInCents,
          reference:      line.reference?.trim().slice(0, 100) || null,
          priceUpdatedAt: now,
          isActive:       true,
        },
      });
      updated++;
    } else {
      // Comprobar si ya existe (puede haberse creado el producto justo arriba en iteración anterior)
      const existing = await (prisma as any).supplierProduct.findFirst({
        where: { supplierId, productId },
        select: { id: true },
      });
      if (existing) {
        await (prisma as any).supplierProduct.update({
          where: { id: existing.id },
          data: {
            presentation:   line.presentation.trim().slice(0, 200),
            quantity:       line.quantity,
            priceInCents:   line.priceInCents,
            reference:      line.reference?.trim().slice(0, 100) || null,
            priceUpdatedAt: now,
            isActive:       true,
          },
        });
        updated++;
      } else {
        await (prisma as any).supplierProduct.create({
          data: {
            supplierId,
            productId:      productId!,
            presentation:   line.presentation.trim().slice(0, 200),
            quantity:       line.quantity,
            priceInCents:   line.priceInCents,
            reference:      line.reference?.trim().slice(0, 100) || null,
            priceUpdatedAt: now,
            isActive:       true,
            createdById:    actor.id,
          },
        });
        created++;
      }
    }
  }

  revalidatePath(`/suppliers/${supplierId}`);
  return { success: true, created, updated };
}

// ── Exportar CSV ──────────────────────────────────────────────────────────────

export interface ExportCsvResult {
  error?: string;
  csv?: string;   // contenido CSV como string (se descarga en el cliente)
}

export async function exportPriceListCsvAction(
  supplierId: string
): Promise<ExportCsvResult> {
  try { await requirePermission("suppliers:read"); }
  catch { return { error: "Sin permiso." }; }

  const rows = await (prisma as any).supplierProduct.findMany({
    where: { supplierId },
    include: { product: true },
    orderBy: [{ product: { name: "asc" } }, { priceInCents: "asc" }],
  });

  const lines: string[] = [
    "id,producto,presentacion,cantidad,unidad,precio_euros,referencia,activo,precio_actualizado"
  ];

  for (const sp of rows as any[]) {
    const priceEuros = (sp.priceInCents / 100).toFixed(2);
    const updatedAt = sp.priceUpdatedAt
      ? (sp.priceUpdatedAt as Date).toISOString().split("T")[0]
      : "";
    const csv = [
      sp.id,
      `"${(sp.product.name as string).replace(/"/g, '""')}"`,
      `"${(sp.presentation as string).replace(/"/g, '""')}"`,
      Number(sp.quantity).toString(),
      sp.product.unit ?? "",
      priceEuros,
      sp.reference ?? "",
      sp.isActive ? "1" : "0",
      updatedAt,
    ].join(",");
    lines.push(csv);
  }

  return { csv: lines.join("\r\n") };
}

// ── Importar CSV ──────────────────────────────────────────────────────────────

export interface ImportCsvResult {
  error?: string;
  success?: boolean;
  updated?: number;
  created?: number;
  skipped?: number;
  errors?: string[];
}

/**
 * Importa un CSV con el mismo formato que exportPriceListCsvAction.
 * Si una fila tiene `id` reconocido → actualiza ese SupplierProduct.
 * Si no tiene `id` → busca por nombre de producto y crea si no existe.
 */
export async function importPriceListCsvAction(
  supplierId: string,
  csvContent: string
): Promise<ImportCsvResult> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { error: "El CSV está vacío o no tiene datos." };

  // Saltar cabecera
  const dataLines = lines.slice(1);
  let updated = 0, created = 0, skipped = 0;
  const errors: string[] = [];
  const now = new Date();

  for (let i = 0; i < dataLines.length; i++) {
    const raw = dataLines[i];
    if (!raw.trim()) continue;

    // Parse CSV simple (respeta comillas dobles)
    const cols = parseCsvRow(raw);
    if (cols.length < 6) {
      errors.push(`Fila ${i + 2}: columnas insuficientes`);
      skipped++;
      continue;
    }

    const [id, producto, presentacion, cantidadStr, unidad, precioEurosStr, referencia, activoStr] = cols;
    const priceInCents = Math.round(parseFloat(precioEurosStr.replace(",", ".")) * 100);
    const quantity = parseFloat(cantidadStr) || 1;
    const isActive = activoStr !== "0";

    if (!producto.trim() || isNaN(priceInCents) || priceInCents < 0) {
      errors.push(`Fila ${i + 2}: datos inválidos (producto o precio)`);
      skipped++;
      continue;
    }

    try {
      // Intentar actualizar por id si se proporcionó y pertenece a este proveedor
      if (id.trim().length === 36) {
        const existing = await (prisma as any).supplierProduct.findFirst({
          where: { id: id.trim(), supplierId },
          select: { id: true },
        });
        if (existing) {
          await (prisma as any).supplierProduct.update({
            where: { id: existing.id },
            data: {
              presentation:   presentacion.trim().slice(0, 200),
              quantity,
              priceInCents,
              reference:      referencia.trim() || null,
              isActive,
              priceUpdatedAt: now,
            },
          });
          updated++;
          continue;
        }
      }

      // Sin id válido → buscar por nombre de producto
      let productId: string | null = null;
      const existingProduct = await (prisma as any).product.findFirst({
        where: { name: { equals: producto.trim(), mode: "insensitive" } },
        select: { id: true },
      });

      if (existingProduct) {
        productId = existingProduct.id;
      } else {
        // Crear producto nuevo
        const newProduct = await (prisma as any).product.create({
          data: {
            name:      producto.trim().slice(0, 200),
            unit:      unidad.trim().slice(0, 20) || null,
            isActive:  true,
            createdById: actor.id,
          },
        });
        productId = newProduct.id;
      }

      // Crear o actualizar SupplierProduct
      const existingSP = await (prisma as any).supplierProduct.findFirst({
        where: { supplierId, productId },
        select: { id: true },
      });

      if (existingSP) {
        await (prisma as any).supplierProduct.update({
          where: { id: existingSP.id },
          data: {
            presentation:   presentacion.trim().slice(0, 200),
            quantity,
            priceInCents,
            reference:      referencia.trim() || null,
            isActive,
            priceUpdatedAt: now,
          },
        });
        updated++;
      } else {
        await (prisma as any).supplierProduct.create({
          data: {
            supplierId,
            productId:      productId!,
            presentation:   presentacion.trim().slice(0, 200),
            quantity,
            priceInCents,
            reference:      referencia.trim() || null,
            isActive,
            priceUpdatedAt: now,
            createdById:    actor.id,
          },
        });
        created++;
      }
    } catch (err: any) {
      errors.push(`Fila ${i + 2}: ${err?.message ?? "error desconocido"}`);
      skipped++;
    }
  }

  revalidatePath(`/suppliers/${supplierId}`);
  return { success: true, updated, created, skipped, errors: errors.slice(0, 10) };
}

// ── CSV parser simple ─────────────────────────────────────────────────────────

function parseCsvRow(row: string): string[] {
  const cols: string[] = [];
  let i = 0;
  while (i < row.length) {
    if (row[i] === '"') {
      let val = "";
      i++; // skip opening quote
      while (i < row.length) {
        if (row[i] === '"' && row[i + 1] === '"') { val += '"'; i += 2; }
        else if (row[i] === '"') { i++; break; }
        else { val += row[i++]; }
      }
      cols.push(val);
      if (row[i] === ",") i++;
    } else {
      let val = "";
      while (i < row.length && row[i] !== ",") val += row[i++];
      if (row[i] === ",") i++;
      cols.push(val.trim());
    }
  }
  return cols;
}
