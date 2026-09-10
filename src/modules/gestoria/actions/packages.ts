/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";
import type {
  GestoriaPackageRow,
  GestoriaItemRow,
  CandidateInvoice,
  GestoriaPackageFormState,
  GestoriaActionState,
} from "../types";

// ── Mappers ───────────────────────────────────────────────────

function mapPackage(p: any): GestoriaPackageRow {
  const items: any[] = p.items ?? [];
  const totalInCents = items.reduce(
    (acc: number, i: any) => acc + (i.invoice?.totalInCents ?? 0),
    0
  );
  return {
    id:          p.id,
    year:        p.year,
    quarter:     p.quarter,
    description: p.description ?? null,
    status:      p.status,
    sentAt:      p.sentAt ? (p.sentAt as Date).toISOString() : null,
    confirmedAt: p.confirmedAt ? (p.confirmedAt as Date).toISOString() : null,
    notes:       p.notes ?? null,
    itemCount:   p._count?.items ?? items.length,
    totalInCents,
    createdAt:   (p.createdAt as Date).toISOString(),
  };
}

function mapItem(i: any): GestoriaItemRow {
  const inv = i.invoice;
  return {
    id:            i.id,
    invoiceId:     inv.id,
    invoiceNumber: inv.invoiceNumber ?? null,
    invoiceDate:   (inv.invoiceDate as Date).toISOString().split("T")[0],
    supplierName:  inv.supplier?.name ?? "",
    supplierId:    inv.supplierId ?? "",
    totalInCents:  inv.totalInCents,
    isPaid:        inv.isPaid,
    fileId:        inv.storedFileId ?? null,
    bundleFileId:  inv.bundle?.storedFileId ?? null,
    addedAt:       (i.addedAt as Date).toISOString(),
  };
}

// ── Queries ───────────────────────────────────────────────────

export async function listPackages(): Promise<GestoriaPackageRow[]> {
  await requirePermission("suppliers:read");
  const rows = await (prisma as any).gestoriaPackage.findMany({
    include: {
      _count: { select: { items: true } },
      items:  { include: { invoice: { select: { totalInCents: true } } } },
    },
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
  });
  return (rows as any[]).map(mapPackage);
}

export async function getPackage(
  packageId: string
): Promise<{ pkg: GestoriaPackageRow; items: GestoriaItemRow[] } | null> {
  await requirePermission("suppliers:read");
  const p = await (prisma as any).gestoriaPackage.findUnique({
    where: { id: packageId },
    include: {
      _count: { select: { items: true } },
      items: {
        include: {
          invoice: {
            include: {
              supplier: { select: { name: true } },
              bundle:   { select: { storedFileId: true } },
            },
          },
        },
        orderBy: { invoice: { invoiceDate: "asc" } },
      },
    },
  });
  if (!p) return null;

  const pkg = mapPackage(p);
  const items = (p.items as any[]).map(mapItem);
  return { pkg, items };
}

/**
 * Facturas del trimestre que aún no pertenecen a ningún paquete de gestoría.
 * Filtra por el rango de meses del trimestre indicado.
 */
export async function getCandidateInvoices(
  year: number,
  quarter: number,
  _packageId?: string
): Promise<CandidateInvoice[]> {
  await requirePermission("suppliers:read");

  // Rango de fechas del trimestre
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth   = startMonth + 2;
  const from = new Date(year, startMonth - 1, 1);
  const to   = new Date(year, endMonth, 0);   // último día del trimestre

  const rows = await (prisma as any).invoice.findMany({
    where: {
      invoiceDate: { gte: from, lte: to },
      // Excluir facturas ya en paquetes ENVIADOS o CONFIRMADOS (los borradores no bloquean)
      gestoriaItems: { none: { package: { status: { in: ["SENT", "CONFIRMED"] } } } },
      deletedAt: null,
    },
    include: { supplier: { select: { name: true } } },
    orderBy: [{ supplier: { name: "asc" } }, { invoiceDate: "asc" }],
  });

  return (rows as any[]).map((inv: any) => ({
    id:            inv.id,
    invoiceNumber: inv.invoiceNumber ?? null,
    invoiceDate:   (inv.invoiceDate as Date).toISOString().split("T")[0],
    supplierName:  inv.supplier?.name ?? "",
    supplierId:    inv.supplierId,
    totalInCents:  inv.totalInCents,
    isPaid:        inv.isPaid,
  }));
}

// ── Mutations ─────────────────────────────────────────────────

export async function createPackageAction(
  _prev: GestoriaPackageFormState,
  formData: FormData
): Promise<GestoriaPackageFormState> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const year    = parseInt(formData.get("year") as string, 10);
  const quarter = parseInt(formData.get("quarter") as string, 10);
  const description = (formData.get("description") as string) || null;
  const notes       = (formData.get("notes") as string) || null;

  if (isNaN(year) || year < 2020 || year > 2100)
    return { fieldErrors: { year: ["Año inválido."] } };
  if (![1, 2, 3, 4].includes(quarter))
    return { fieldErrors: { quarter: ["Trimestre inválido."] } };

  // Se permiten múltiples paquetes por trimestre (envíos parciales)
  const pkg = await (prisma as any).gestoriaPackage.create({
    data: { year, quarter, description, notes, createdById: actor.id },
  });

  revalidatePath("/gestoria");
  return { success: true, packageId: pkg.id };
}

export async function addInvoicesToPackageAction(
  packageId: string,
  invoiceIds: string[]
): Promise<GestoriaActionState> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  if (!invoiceIds.length) return { error: "No se seleccionó ninguna factura." };

  const pkg = await (prisma as any).gestoriaPackage.findUnique({
    where: { id: packageId }, select: { status: true },
  });
  if (!pkg) return { error: "Paquete no encontrado." };
  if (pkg.status !== "DRAFT") return { error: "Solo se pueden añadir facturas a paquetes en borrador." };

  // Insertar ignorando duplicados (createMany skipDuplicates)
  await (prisma as any).gestoriaPackageItem.createMany({
    data: invoiceIds.map((invoiceId) => ({ packageId, invoiceId })),
    skipDuplicates: true,
  });

  revalidatePath(`/gestoria/${packageId}`);
  return { success: true };
}

export async function removeInvoiceFromPackageAction(
  itemId: string,
  packageId: string
): Promise<GestoriaActionState> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const pkg = await (prisma as any).gestoriaPackage.findUnique({
    where: { id: packageId }, select: { status: true },
  });
  if (!pkg) return { error: "Paquete no encontrado." };
  if (pkg.status !== "DRAFT") return { error: "No se pueden quitar facturas de un paquete enviado." };

  await (prisma as any).gestoriaPackageItem.delete({ where: { id: itemId } });
  revalidatePath(`/gestoria/${packageId}`);
  return { success: true };
}

export async function markPackageSentAction(
  packageId: string
): Promise<GestoriaActionState> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const pkg = await (prisma as any).gestoriaPackage.findUnique({
    where: { id: packageId },
    include: { _count: { select: { items: true } } },
  });
  if (!pkg) return { error: "Paquete no encontrado." };
  if (pkg.status !== "DRAFT") return { error: "Este paquete ya fue enviado." };
  if (pkg._count.items === 0) return { error: "Añade al menos una factura antes de marcar como enviado." };

  await (prisma as any).gestoriaPackage.update({
    where: { id: packageId },
    data:  { status: "SENT", sentAt: new Date() },
  });

  revalidatePath(`/gestoria/${packageId}`);
  revalidatePath("/gestoria");
  return { success: true };
}

export async function markPackageConfirmedAction(
  packageId: string
): Promise<GestoriaActionState> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  await (prisma as any).gestoriaPackage.update({
    where: { id: packageId },
    data:  { status: "CONFIRMED", confirmedAt: new Date() },
  });

  revalidatePath(`/gestoria/${packageId}`);
  revalidatePath("/gestoria");
  return { success: true };
}

export async function deletePackageAction(
  packageId: string
): Promise<GestoriaActionState> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const pkg = await (prisma as any).gestoriaPackage.findUnique({
    where: { id: packageId },
    select: { id: true },
  });
  if (!pkg) return { error: "Paquete no encontrado." };

  // Eliminar ítems primero (FK constraint) y luego el paquete
  await (prisma as any).gestoriaPackageItem.deleteMany({ where: { packageId } });
  await (prisma as any).gestoriaPackage.delete({ where: { id: packageId } });

  revalidatePath("/gestoria");
  return { success: true };
}
