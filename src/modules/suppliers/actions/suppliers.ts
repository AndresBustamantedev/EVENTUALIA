/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";
import { createSupplierSchema, updateSupplierSchema } from "../lib/validators";
import type { SupplierRow, SupplierFormState, TagRow, SupplierBranch } from "../types";

function mapSupplier(s: any): SupplierRow {
  return {
    id:          s.id,
    name:        s.name,
    contactName: s.contactName,
    email:       s.email,
    phone:       s.phone,
    address:     s.address,
    taxId:       s.taxId,
    website:     s.website ?? null,
    notes:       s.notes,
    isActive:    s.isActive,
    branch:      (s.branch as SupplierBranch) ?? "BOTH",
    tags:        (s.tags ?? []).map((t: any): TagRow => ({ id: t.id, name: t.name, color: t.color })),
    createdAt:   (s.createdAt as Date).toISOString(),
  };
}

const TAG_INCLUDE = { tags: { orderBy: { name: "asc" } } };

export async function listSuppliers(activeOnly = false): Promise<SupplierRow[]> {
  await requirePermission("suppliers:read");
  const rows = await (prisma as any).supplier.findMany({
    where:   activeOnly ? { isActive: true } : undefined,
    include: TAG_INCLUDE,
    orderBy: { name: "asc" },
  });
  return (rows as any[]).map(mapSupplier);
}

export async function getSupplier(id: string): Promise<SupplierRow> {
  await requirePermission("suppliers:read");
  const s = await (prisma as any).supplier.findUnique({ where: { id }, include: TAG_INCLUDE });
  if (!s) throw new Error("Proveedor no encontrado");
  return mapSupplier(s);
}

/** Devuelve el recuento de registros vinculados al proveedor (para decidir si se puede eliminar). */
export async function getSupplierCounts(id: string): Promise<{
  invoiceCount: number;
  bundleCount:  number;
  orderCount:   number;
}> {
  await requirePermission("suppliers:read");
  const [invoiceCount, bundleCount, orderCount] = await Promise.all([
    (prisma as any).invoice.count({ where: { supplierId: id } }),
    (prisma as any).invoiceBundle.count({ where: { supplierId: id } }),
    (prisma as any).order.count({ where: { supplierId: id } }),
  ]);
  return { invoiceCount, bundleCount, orderCount };
}

// ── Tags helpers ────────────────────────────────────────────────────────────

/** Parsea una lista de IDs de tags desde un campo hidden del formulario */
function parseTagIds(formData: FormData): string[] {
  const raw = formData.get("tagIds") as string | null;
  if (!raw) return [];
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

function tagsConnect(ids: string[]) {
  return ids.length ? { connect: ids.map(id => ({ id })) } : undefined;
}

function tagsSet(ids: string[]) {
  return { set: ids.map(id => ({ id })) };
}

// ── Create supplier ─────────────────────────────────────────────────────────

export async function createSupplierAction(
  _prev: SupplierFormState,
  formData: FormData
): Promise<SupplierFormState> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso para crear proveedores." }; }

  const raw = {
    name:        formData.get("name") as string,
    contactName: (formData.get("contactName") as string) || undefined,
    email:       (formData.get("email") as string) || undefined,
    phone:       (formData.get("phone") as string) || undefined,
    address:     (formData.get("address") as string) || undefined,
    taxId:       (formData.get("taxId") as string) || undefined,
    website:     (formData.get("website") as string) || undefined,
    notes:       (formData.get("notes") as string) || undefined,
  };

  const parsed = createSupplierSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }
  const d = parsed.data;
  const branch = (formData.get("branch") as SupplierBranch) || "BOTH";
  const tagIds = parseTagIds(formData);

  // Comprobar CIF/NIF duplicado
  if (d.taxId) {
    const existing = await (prisma as any).supplier.findFirst({
      where: { taxId: d.taxId, isActive: true },
      select: { id: true, name: true },
    });
    if (existing) {
      return { fieldErrors: { taxId: [`Ya existe el proveedor "${existing.name}" con ese CIF/NIF`] } };
    }
  }

  const supplier = await (prisma as any).supplier.create({
    data: {
      name:        d.name,
      contactName: d.contactName || null,
      email:       d.email || null,
      phone:       d.phone || null,
      address:     d.address || null,
      taxId:       d.taxId || null,
      website:     d.website || null,
      notes:       d.notes || null,
      branch,
      createdById: actor.id,
      tags:        tagsConnect(tagIds),
    },
  });

  revalidatePath("/suppliers");
  return { success: true, supplierId: supplier.id };
}

// ── Update supplier ─────────────────────────────────────────────────────────

export async function updateSupplierAction(
  _prev: SupplierFormState,
  formData: FormData
): Promise<SupplierFormState> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso para editar proveedores." }; }

  const raw = {
    id:          formData.get("id") as string,
    name:        formData.get("name") as string,
    contactName: (formData.get("contactName") as string) || undefined,
    email:       (formData.get("email") as string) || undefined,
    phone:       (formData.get("phone") as string) || undefined,
    address:     (formData.get("address") as string) || undefined,
    taxId:       (formData.get("taxId") as string) || undefined,
    website:     (formData.get("website") as string) || undefined,
    notes:       (formData.get("notes") as string) || undefined,
    isActive:    (formData.get("isActive") as string) || "true",
  };

  const parsed = updateSupplierSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }
  const d = parsed.data;
  const branch = (formData.get("branch") as SupplierBranch) || "BOTH";
  const tagIds = parseTagIds(formData);

  // Comprobar CIF/NIF duplicado (excluyendo el propio proveedor)
  if (d.taxId) {
    const existing = await (prisma as any).supplier.findFirst({
      where: { taxId: d.taxId, isActive: true, NOT: { id: d.id } },
      select: { id: true, name: true },
    });
    if (existing) {
      return { fieldErrors: { taxId: [`Ya existe el proveedor "${existing.name}" con ese CIF/NIF`] } };
    }
  }

  await (prisma as any).supplier.update({
    where: { id: d.id },
    data: {
      name:        d.name,
      contactName: d.contactName || null,
      email:       d.email || null,
      phone:       d.phone || null,
      address:     d.address || null,
      taxId:       d.taxId || null,
      website:     d.website || null,
      notes:       d.notes || null,
      isActive:    d.isActive ?? true,
      branch,
      tags:        tagsSet(tagIds),
    },
  });

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${d.id}`);
  return { success: true };
}

// ── Delete supplier ─────────────────────────────────────────────────────────

export async function deleteSupplierAction(supplierId: string): Promise<{ error?: string }> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  // Comprobar que no tiene registros vinculados
  const [invoiceCount, bundleCount, orderCount] = await Promise.all([
    (prisma as any).invoice.count({ where: { supplierId } }),
    (prisma as any).invoiceBundle.count({ where: { supplierId } }),
    (prisma as any).order.count({ where: { supplierId } }),
  ]);

  if (invoiceCount > 0) {
    return { error: `No se puede eliminar: tiene ${invoiceCount} factura(s) registrada(s). Elimínalas primero.` };
  }
  if (bundleCount > 0) {
    return { error: `No se puede eliminar: tiene ${bundleCount} bundle(s) de documentos. Elimínalos primero.` };
  }
  if (orderCount > 0) {
    return { error: `No se puede eliminar: tiene ${orderCount} pedido(s) registrado(s). Elimínalos primero.` };
  }

  // Borrar etiquetas y demás relaciones sin documentos
  await (prisma as any).supplier.delete({ where: { id: supplierId } });

  revalidatePath("/suppliers");
  redirect("/suppliers");
}

// ── Tag CRUD ────────────────────────────────────────────────────────────────

export async function listTags(): Promise<TagRow[]> {
  await requirePermission("suppliers:read");
  const rows = await (prisma as any).supplierTag.findMany({ orderBy: { name: "asc" } });
  return (rows as any[]).map((t: any): TagRow => ({ id: t.id, name: t.name, color: t.color }));
}

export async function createTagAction(name: string, color: string): Promise<{ error?: string; tag?: TagRow }> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return { error: "El nombre es obligatorio." };

  try {
    const tag = await (prisma as any).supplierTag.create({ data: { name: trimmed, color } });
    revalidatePath("/suppliers");
    return { tag: { id: tag.id, name: tag.name, color: tag.color } };
  } catch {
    return { error: "Ya existe una etiqueta con ese nombre." };
  }
}

export async function updateTagAction(id: string, name: string, color: string): Promise<{ error?: string }> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return { error: "El nombre es obligatorio." };

  try {
    await (prisma as any).supplierTag.update({ where: { id }, data: { name: trimmed, color } });
    revalidatePath("/suppliers");
    return {};
  } catch {
    return { error: "Ya existe una etiqueta con ese nombre." };
  }
}

export async function deleteTagAction(id: string): Promise<{ error?: string }> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  await (prisma as any).supplierTag.delete({ where: { id } });
  revalidatePath("/suppliers");
  return {};
}
// ── Unassigned supplier (system) ────────────────────────────────────────────

/** Internal name used to find/create the special "Sin asignar" supplier. */
const UNASSIGNED_SUPPLIER_NAME = "Sin asignar";

/**
 * Returns the ID of the special "Sin asignar" supplier, creating it if it
 * doesn't exist yet. Call from server components / pages only.
 */
export async function getOrCreateUnassignedSupplier(): Promise<string> {
  const actor = await requirePermission("suppliers:read");

  const existing = await (prisma as any).supplier.findFirst({
    where: { name: UNASSIGNED_SUPPLIER_NAME, isActive: false },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Verificar que actor.id existe realmente en la DB.
  // En PC2 puede haber un ID de sesión antigua (de PC1) cuyo usuario ya no existe.
  // En ese caso usamos el primer usuario activo como fallback seguro.
  let createdById = actor.id;
  const actorInDb = await (prisma as any).user.findUnique({
    where:  { id: actor.id },
    select: { id: true },
  });
  if (!actorInDb) {
    const fallback = await (prisma as any).user.findFirst({
      where:   { isActive: true },
      select:  { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!fallback) throw new Error("No hay usuarios activos en la base de datos");
    createdById = fallback.id;
  }

  // Create lazily — proveedor especial del sistema
  const supplier = await (prisma as any).supplier.create({
    data: {
      name:        UNASSIGNED_SUPPLIER_NAME,
      isActive:    false,
      branch:      "BOTH",
      notes:       "Proveedor especial del sistema. Facturas importadas sin proveedor conocido.",
      createdById,
    },
  });
  return supplier.id;
}

/**
 * Quickly creates a supplier with just a name (used during bulk import).
 * Returns { id } on success or { error } on failure.
 */
export async function quickCreateSupplierAction(
  name: string
): Promise<{ id?: string; error?: string }> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso para crear proveedores." }; }

  const trimmed = name.trim().slice(0, 200);
  if (!trimmed) return { error: "El nombre no puede estar vacío." };

  // Check for active duplicate by name (case-insensitive)
  const dup = await (prisma as any).supplier.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" }, isActive: true },
    select: { id: true, name: true },
  });
  if (dup) return { error: `Ya existe "${dup.name}". Selecciónalo del desplegable.` };

  const supplier = await (prisma as any).supplier.create({
    data: {
      name:        trimmed,
      isActive:    true,
      branch:      "BOTH",
      createdById: actor.id,
    },
  });

  revalidatePath("/suppliers");
  revalidatePath("/financiero/importar");
  return { id: supplier.id };
}
