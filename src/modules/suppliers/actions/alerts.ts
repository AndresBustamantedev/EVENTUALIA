/**
 * Alertas automáticas del módulo de proveedores / facturas.
 * Se calculan en servidor, sin lógica en cliente.
 */
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";

export interface AppAlert {
  id:     string;
  level:  "error" | "warning" | "info";
  icon:   string;
  title:  string;
  detail: string;
  count:  number;
  href?:  string;
}

// ── Dismissal persistence ──────────────────────────────────────

export async function dismissAlertAction(alertId: string): Promise<void> {
  const actor = await requirePermission("suppliers:read");
  await (prisma as any).dismissedAlert.upsert({
    where:  { userId_alertId: { userId: actor.id, alertId } },
    update: {},
    create: { userId: actor.id, alertId },
  });
  revalidatePath("/invoices");
}

export async function undismissAlertAction(alertId: string): Promise<void> {
  const actor = await requirePermission("suppliers:read");
  await (prisma as any).dismissedAlert.deleteMany({
    where: { userId: actor.id, alertId },
  });
  revalidatePath("/invoices");
}

// ── Shared computation ─────────────────────────────────────────

async function _computeAllAlerts(): Promise<{ alerts: AppAlert[]; dismissedIds: Set<string> }> {
  const actor = await requirePermission("suppliers:read");

  const now            = new Date();
  const thirtyDaysAgo  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo  = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const oneDayAgo      = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const lastYear       = now.getFullYear() - 1;

  // Load dismissed alert IDs for this user
  const dismissedRows = await (prisma as any).dismissedAlert.findMany({
    where:  { userId: actor.id },
    select: { alertId: true },
  });
  const dismissedIds = new Set<string>((dismissedRows as any[]).map((r: any) => r.alertId));

  const alerts: AppAlert[] = [];

  // ── 1. Facturas vencidas sin pagar (>30 días) ────────────────
  const overdueCount = await (prisma as any).invoice.count({
    where: { isPaid: false, invoiceDate: { lt: thirtyDaysAgo }, deletedAt: null },
  });
  if (overdueCount > 0) alerts.push({
    id: "overdue", level: "error", icon: "🔴",
    title:  `${overdueCount} factura${overdueCount !== 1 ? "s" : ""} vencida${overdueCount !== 1 ? "s" : ""} sin pagar`,
    detail: "Pendientes de pago con más de 30 días desde la fecha de factura.",
    count:  overdueCount, href: "/financiero?alert=overdue",
  });

  // ── 2. Facturas con importe 0 € ──────────────────────────────
  const zeroCount = await (prisma as any).invoice.count({
    where: { totalInCents: 0, deletedAt: null },
  });
  if (zeroCount > 0) alerts.push({
    id: "zero_amount", level: "warning", icon: "⚠️",
    title:  `${zeroCount} factura${zeroCount !== 1 ? "s" : ""} con importe 0 €`,
    detail: "Posiblemente incompletas o registradas sin importe.",
    count:  zeroCount, href: "/financiero?alert=zero_amount",
  });

  // ── 3. Escáneres sin facturas extraídas (>24h) ───────────────
  const bundles = await (prisma as any).invoiceBundle.findMany({
    where: { createdAt: { lt: oneDayAgo } },
    select: { id: true, supplierId: true, _count: { select: { invoices: { where: { deletedAt: null } } } } },
  });
  const emptyBundles = (bundles as any[]).filter(b => b._count.invoices === 0);
  if (emptyBundles.length > 0) alerts.push({
    id: "empty_bundles", level: "warning", icon: "📁",
    title:  `${emptyBundles.length} escáner${emptyBundles.length !== 1 ? "es" : ""} sin facturas extraídas`,
    detail: "Subidos hace más de 24h sin ninguna factura registrada.",
    count:  emptyBundles.length, href: "/invoices?alert=empty_bundles",
  });

  // ── 4. Proveedores sin factura en los últimos 90 días ────────
  const activeSuppliers = await (prisma as any).supplier.findMany({
    where: { isActive: true },
    select: {
      id: true,
      _count: { select: { invoices: { where: { invoiceDate: { gte: ninetyDaysAgo }, deletedAt: null } } } },
    },
  });
  const noRecentCount = (activeSuppliers as any[]).filter(s => s._count.invoices === 0).length;
  if (noRecentCount > 0) alerts.push({
    id: "no_recent_invoice", level: "info", icon: "📋",
    title:  `${noRecentCount} proveedor${noRecentCount !== 1 ? "es" : ""} sin facturas en 90 días`,
    detail: "Proveedores activos sin ninguna factura en los últimos 3 meses.",
    count:  noRecentCount, href: "/suppliers?alert=no_recent_invoice",
  });

  // ── 5. IVA incoherente (base + taxInCents ≠ total, diff >1 €) ─
  const taxedInvoices = await (prisma as any).invoice.findMany({
    where: { baseAmountInCents: { not: null }, taxInCents: { not: null }, deletedAt: null },
    select: { id: true, baseAmountInCents: true, taxInCents: true, totalInCents: true },
  });
  const incoherentVat = (taxedInvoices as any[]).filter(inv =>
    Math.abs((inv.baseAmountInCents + inv.taxInCents) - inv.totalInCents) > 100
  );
  if (incoherentVat.length > 0) alerts.push({
    id: "incoherent_vat", level: "warning", icon: "🧾",
    title:  `${incoherentVat.length} factura${incoherentVat.length !== 1 ? "s" : ""} con IVA incoherente`,
    detail: "La suma de base + cuota IVA no cuadra con el total (diferencia > 1 €).",
    count:  incoherentVat.length, href: "/financiero?alert=incoherent_vat",
  });

  // ── 6. Proveedores sin CIF/NIF ───────────────────────────────
  const noCifCount = await (prisma as any).supplier.count({
    where: { isActive: true, OR: [{ taxId: null }, { taxId: "" }] },
  });
  if (noCifCount > 0) alerts.push({
    id: "no_cif", level: "info", icon: "🪪",
    title:  `${noCifCount} proveedor${noCifCount !== 1 ? "es" : ""} sin CIF/NIF registrado`,
    detail: "Proveedores activos sin identificador fiscal — necesario para gestoría.",
    count:  noCifCount, href: "/suppliers?alert=no_cif",
  });

  // ── 7. Trimestres del año pasado sin cerrar ───────────────────
  const openLastYear = await (prisma as any).supplierQuarterStatus.count({
    where: { year: lastYear, closed: false },
  });
  if (openLastYear > 0) alerts.push({
    id: "open_quarters", level: "error", icon: "📅",
    title:  `${openLastYear} trimestre${openLastYear !== 1 ? "s" : ""} de ${lastYear} sin cerrar`,
    detail: "Hay trimestres del año pasado pendientes de cierre contable.",
    count:  openLastYear, href: "/suppliers?alert=open_quarters",
  });

  // ── 8. Facturas duplicadas sospechosas ───────────────────────
  const allInvs = await (prisma as any).invoice.findMany({
    where: { deletedAt: null, totalInCents: { gt: 0 } },
    select: { id: true, supplierId: true, totalInCents: true, invoiceDate: true },
    orderBy: [{ supplierId: "asc" }, { totalInCents: "asc" }, { invoiceDate: "asc" }],
  });
  const dupIds = new Set<string>();
  for (let i = 0; i < (allInvs as any[]).length - 1; i++) {
    const a = (allInvs as any[])[i];
    const b = (allInvs as any[])[i + 1];
    if (a.supplierId === b.supplierId && a.totalInCents === b.totalInCents) {
      const diff = Math.abs(new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime());
      if (diff <= 7 * 24 * 60 * 60 * 1000) { dupIds.add(a.id); dupIds.add(b.id); }
    }
  }
  const dupPairs = Math.floor(dupIds.size / 2);
  if (dupPairs > 0) alerts.push({
    id: "duplicates", level: "warning", icon: "🔁",
    title:  `${dupPairs} posible${dupPairs !== 1 ? "s" : ""} factura${dupPairs !== 1 ? "s" : ""} duplicada${dupPairs !== 1 ? "s" : ""}`,
    detail: "Mismo proveedor, mismo importe y fechas próximas. Revisa si son duplicados.",
    count:  dupPairs, href: "/financiero?alert=duplicates",
  });

  // ── 9. Facturas sin enviar a gestoría ────────────────────────
  const noGestoriaCount = await (prisma as any).invoice.count({
    where: {
      deletedAt: null,
      gestoriaItems: {
        none: { package: { status: { in: ["SENT", "CONFIRMED"] } } },
      },
    },
  });
  if (noGestoriaCount > 0) alerts.push({
    id: "no_gestoria", level: "info", icon: "📮",
    title:  `${noGestoriaCount} factura${noGestoriaCount !== 1 ? "s" : ""} sin enviar a gestoría`,
    detail: "Facturas que aún no pertenecen a ningún paquete enviado o confirmado.",
    count:  noGestoriaCount, href: "/gestoria",
  });

  return { alerts, dismissedIds };
}

// ── Public queries ─────────────────────────────────────────────

const ORDER = { error: 0, warning: 1, info: 2 } as const;

/** Alertas activas no descartadas. */
export async function getAlerts(): Promise<AppAlert[]> {
  const { alerts, dismissedIds } = await _computeAllAlerts();
  return alerts
    .filter(a => !dismissedIds.has(a.id))
    .sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

/**
 * Alertas que el usuario ha descartado con ✕ pero que siguen siendo
 * relevantes (el problema sigue existiendo en la BD).
 */
export async function getDismissedAlerts(): Promise<AppAlert[]> {
  const { alerts, dismissedIds } = await _computeAllAlerts();
  return alerts
    .filter(a => dismissedIds.has(a.id))
    .sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}
