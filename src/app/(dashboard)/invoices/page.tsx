/**
 * /invoices — Vista principal de facturas por proveedor.
 * Muestra tarjetas de proveedores con conteo y última factura.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { listSuppliers, getOrCreateUnassignedSupplier } from "@/modules/suppliers/actions/suppliers";
import { listInvoices, listPendingReviewInvoices } from "@/modules/suppliers/actions/invoices";
import { getAlerts, getDismissedAlerts } from "@/modules/suppliers/actions/alerts";
import { InvoicesIndexClient } from "@/modules/suppliers/components/InvoicesIndexClient";

export const metadata = { title: "Facturas — Cruz Blanca" };

export default async function InvoicesPage() {
  let actor: { role: string };
  try {
    actor = await requirePermission("suppliers:read");
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/");
    throw e;
  }

  const canWrite = actor.role === "ADMIN" || actor.role === "ENCARGADO";

  const [suppliers, allInvoices, pendingReviewInvoices, alerts, dismissedAlerts, unassignedSupplierId] = await Promise.all([
    listSuppliers(),
    listInvoices(),
    listPendingReviewInvoices(),
    getAlerts(),
    getDismissedAlerts(),
    getOrCreateUnassignedSupplier(),
  ]);

  // Estadísticas por proveedor
  const stats = new Map<string, { count: number; lastDate: string }>();
  for (const inv of allInvoices) {
    const s = stats.get(inv.supplierId);
    if (!s) {
      stats.set(inv.supplierId, { count: 1, lastDate: inv.invoiceDate });
    } else {
      s.count++;
      if (inv.invoiceDate > s.lastDate) s.lastDate = inv.invoiceDate;
    }
  }

  // Facturas sin número (pendientes de clasificar)
  const unclassified = allInvoices.filter(i => !i.invoiceNumber);

  // Facturas en el bucket "Sin asignar"
  const unassignedCount = stats.get(unassignedSupplierId)?.count ?? 0;

  const supplierCards = suppliers
    .filter(s => s.isActive && s.id !== unassignedSupplierId)
    .map(s => ({
      id:       s.id,
      name:     s.name,
      count:    stats.get(s.id)?.count   ?? 0,
      lastDate: stats.get(s.id)?.lastDate ?? null,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return (
    <InvoicesIndexClient
      supplierCards={supplierCards}
      suppliers={suppliers}
      unclassifiedInvoices={unclassified}
      canWrite={canWrite}
      alerts={alerts}
      dismissedAlerts={dismissedAlerts}
      unassignedSupplierId={unassignedSupplierId}
      unassignedCount={unassignedCount}
      pendingReviewInvoices={pendingReviewInvoices}
    />
  );
}
