/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";
import {
  createProductSchema,
  updateProductSchema,
  createSupplierProductSchema,
} from "../lib/validators";
import type {
  ProductRow,
  SupplierProductRow,
  PriceComparisonRow,
  ProductFormState,
  SupplierProductFormState,
} from "../types";

function mapProduct(p: any): ProductRow {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    unit: p.unit,
    notes: p.notes,
    isActive: p.isActive,
  };
}

function mapSupplierProduct(sp: any): SupplierProductRow {
  const qty = Number(sp.quantity);
  return {
    id: sp.id,
    supplierId: sp.supplierId,
    supplierName: sp.supplier?.name ?? "",
    productId: sp.productId,
    productName: sp.product?.name ?? "",
    productUnit: sp.product?.unit ?? null,
    presentation: sp.presentation,
    quantity: qty,
    priceInCents: sp.priceInCents,
    pricePerUnit: qty > 0 ? Math.round(sp.priceInCents / qty) : sp.priceInCents,
    reference: sp.reference,
    isActive: sp.isActive,
    priceUpdatedAt: sp.priceUpdatedAt ? (sp.priceUpdatedAt as Date).toISOString() : null,
  };
}

export async function listProducts(activeOnly = false): Promise<ProductRow[]> {
  await requirePermission("suppliers:read");
  const rows = await (prisma as any).product.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return (rows as any[]).map(mapProduct);
}

export async function createProductAction(
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const raw = {
    name: formData.get("name") as string,
    category: (formData.get("category") as string) || undefined,
    unit: (formData.get("unit") as string) || undefined,
    notes: (formData.get("notes") as string) || undefined,
  };
  const parsed = createProductSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const d = parsed.data;

  const product = await (prisma as any).product.create({
    data: {
      name: d.name,
      category: d.category || null,
      unit: d.unit || null,
      notes: d.notes || null,
      createdById: actor.id,
    },
  });
  revalidatePath("/suppliers");
  return { success: true, productId: product.id };
}

export async function updateProductAction(
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const raw = {
    id: formData.get("id") as string,
    name: formData.get("name") as string,
    category: (formData.get("category") as string) || undefined,
    unit: (formData.get("unit") as string) || undefined,
    notes: (formData.get("notes") as string) || undefined,
    isActive: (formData.get("isActive") as string) || "true",
  };
  const parsed = updateProductSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const d = parsed.data;

  await (prisma as any).product.update({
    where: { id: d.id },
    data: { name: d.name, category: d.category || null, unit: d.unit || null, notes: d.notes || null, isActive: d.isActive ?? true },
  });
  revalidatePath("/suppliers");
  return { success: true };
}

// ── Precios por proveedor ─────────────────────────────────────

export async function listSupplierProducts(supplierId: string): Promise<SupplierProductRow[]> {
  await requirePermission("suppliers:read");
  const rows = await (prisma as any).supplierProduct.findMany({
    where: { supplierId, isActive: true },
    include: { product: true, supplier: { select: { name: true } } },
    orderBy: [{ product: { name: "asc" } }, { priceInCents: "asc" }],
  });
  return (rows as any[]).map(mapSupplierProduct);
}

export async function createSupplierProductAction(
  _prev: SupplierProductFormState,
  formData: FormData
): Promise<SupplierProductFormState> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const raw = {
    supplierId: formData.get("supplierId") as string,
    productId: formData.get("productId") as string,
    presentation: formData.get("presentation") as string,
    quantity: formData.get("quantity") as string,
    priceInCents: formData.get("priceInCents") as string,
    reference: (formData.get("reference") as string) || undefined,
  };
  const parsed = createSupplierProductSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const d = parsed.data;

  await (prisma as any).supplierProduct.create({
    data: {
      supplierId: d.supplierId,
      productId: d.productId,
      presentation: d.presentation,
      quantity: d.quantity,
      priceInCents: d.priceInCents,
      reference: d.reference || null,
      createdById: actor.id,
    },
  });
  revalidatePath(`/suppliers/${d.supplierId}`);
  return { success: true };
}

// ── Comparación de precios ────────────────────────────────────

export async function getPriceComparison(productIds?: string[]): Promise<PriceComparisonRow[]> {
  await requirePermission("suppliers:read");

  const rows = await (prisma as any).supplierProduct.findMany({
    where: {
      isActive: true,
      ...(productIds?.length ? { productId: { in: productIds } } : {}),
    },
    include: {
      product: true,
      supplier: { select: { id: true, name: true, isActive: true } },
    },
    orderBy: [{ product: { name: "asc" } }, { priceInCents: "asc" }],
  });

  // Group by product
  const map = new Map<string, PriceComparisonRow>();
  for (const sp of rows as any[]) {
    if (!map.has(sp.productId)) {
      map.set(sp.productId, {
        productId: sp.productId,
        productName: sp.product.name,
        productUnit: sp.product.unit,
        offers: [],
      });
    }
    const qty = Number(sp.quantity);
    map.get(sp.productId)!.offers.push({
      supplierId: sp.supplierId,
      supplierName: sp.supplier.name,
      supplierProductId: sp.id,
      presentation: sp.presentation,
      quantity: qty,
      priceInCents: sp.priceInCents,
      pricePerUnit: qty > 0 ? Math.round(sp.priceInCents / qty) : sp.priceInCents,
      reference: sp.reference,
    });
  }

  return Array.from(map.values());
}
