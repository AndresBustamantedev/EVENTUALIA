import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import { listInvoices } from "@/modules/suppliers/actions/invoices";
import { listSuppliers } from "@/modules/suppliers/actions/suppliers";
import { getAlerts } from "@/modules/suppliers/actions/alerts";
import type { InvoiceRow } from "@/modules/suppliers/types";
import type { DuplicatePair } from "@/modules/suppliers/actions/alerts";
import { FinancieroSearchClient } from "./FinancieroSearchClient";

function yearOf(dateStr: string): number {
  return new Date(dateStr).getFullYear();
}
function quarterOf(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getMonth() + 1) / 3);
}

const ALERT_LABELS: Record<string, { icon: string; label: string }> = {
  overdue:        { icon: "🔴", label: "Facturas vencidas sin pagar (>30 días)" },
  zero_amount:    { icon: "⚠️", label: "Facturas con importe 0 €" },
  incoherent_vat: { icon: "🧾", label: "Facturas con IVA incoherente" },
  duplicates:     { icon: "🔁", label: "Posibles facturas duplicadas" },
};

interface PageProps {
  searchParams: Promise<Record<string, string>>;
}

export default async function FinancieroPage({ searchParams }: PageProps) {
  try {
    await requirePermission("suppliers:read");
  } catch {
    redirect("/login");
  }

  const sp = await searchParams;
  const alertFilter = sp.alert ?? "";
  const supplierId  = sp.supplier ?? "";
  const year        = sp.year    ?? "";
  const quarter     = sp.quarter ?? "";
  const paid        = sp.paid    ?? "";

  const [allInvoices, suppliers, allAlerts] = await Promise.all([
    listInvoices(),
    listSuppliers(),
    alertFilter === "duplicates" ? getAlerts() : Promise.resolve([]),
  ]);

  const duplicatePairs: DuplicatePair[] =
    alertFilter === "duplicates"
      ? (allAlerts.find(a => a.id === "duplicates")?.pairs ?? [])
      : [];

  // ── Filtros de alerta (aplicados antes que los demás) ────────
  let invoices: InvoiceRow[] = allInvoices;

  if (alertFilter === "overdue") {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    invoices = invoices.filter(i => !i.isPaid && new Date(i.invoiceDate) < cutoff);
  } else if (alertFilter === "zero_amount") {
    invoices = invoices.filter(i => i.totalInCents === 0);
  } else if (alertFilter === "incoherent_vat") {
    invoices = invoices.filter(i => {
      const base = i.baseAmountInCents;
      const tax  = i.taxInCents;
      if (base == null || tax == null) return false;
      return Math.abs((base + tax) - i.totalInCents) > 100;
    });
  } else if (alertFilter === "duplicates") {
    const sorted = [...allInvoices]
      .filter(i => i.totalInCents > 0)
      .sort((a, b) =>
        a.supplierId.localeCompare(b.supplierId) ||
        a.totalInCents - b.totalInCents ||
        a.invoiceDate.localeCompare(b.invoiceDate)
      );
    const dupIds = new Set<string>();
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      if (a.supplierId === b.supplierId && a.totalInCents === b.totalInCents) {
        const diff = Math.abs(new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime());
        if (diff <= 7 * 24 * 60 * 60 * 1000) { dupIds.add(a.id); dupIds.add(b.id); }
      }
    }
    invoices = allInvoices.filter(i => dupIds.has(i.id));
  }

  // ── Filtros normales (sobre lo anterior) ─────────────────────
  if (supplierId) invoices = invoices.filter(i => i.supplierId === supplierId);
  if (year)       invoices = invoices.filter(i => String(yearOf(i.invoiceDate)) === year);
  if (quarter)    invoices = invoices.filter(i => String(quarterOf(i.invoiceDate)) === quarter);
  if (paid === "true")  invoices = invoices.filter(i => i.isPaid);
  if (paid === "false") invoices = invoices.filter(i => !i.isPaid);

  const years = [...new Set(allInvoices.map(i => yearOf(i.invoiceDate)))].sort((a, b) => b - a);
  const alertInfo = alertFilter ? ALERT_LABELS[alertFilter] : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Facturas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Vista global de todas las facturas registradas
          </p>
        </div>
      </div>

      {/* ── Banner de alerta activa ───────────────────────── */}
      {alertInfo && (
        <div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-4 py-3">
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {alertInfo.icon} Filtrando por alerta: <strong>{alertInfo.label}</strong>
            <span className="ml-2 text-amber-700 dark:text-amber-400 font-normal">
              — {invoices.length} factura{invoices.length !== 1 ? "s" : ""}
            </span>
          </span>
          <Link href="/financiero" className="text-xs text-amber-700 dark:text-amber-400 hover:underline shrink-0 ml-4">
            Ver todas →
          </Link>
        </div>
      )}

      {/* ── Filtros ── */}
      <form className="flex flex-wrap gap-3 items-end" method="GET">
        {alertFilter && <input type="hidden" name="alert" value={alertFilter} />}
        <div>
          <label className="block text-xs font-medium mb-1 text-muted-foreground">Proveedor</label>
          <select name="supplier" defaultValue={supplierId}
            className="rounded-md border px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">Todos</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-muted-foreground">Año</label>
          <select name="year" defaultValue={year}
            className="rounded-md border px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">Todos</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-muted-foreground">Trimestre</label>
          <select name="quarter" defaultValue={quarter}
            className="rounded-md border px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">Todos</option>
            <option value="1">1T (Ene–Mar)</option>
            <option value="2">2T (Abr–Jun)</option>
            <option value="3">3T (Jul–Sep)</option>
            <option value="4">4T (Oct–Dic)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-muted-foreground">Estado pago</label>
          <select name="paid" defaultValue={paid}
            className="rounded-md border px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">Todos</option>
            <option value="true">Pagadas</option>
            <option value="false">Pendientes</option>
          </select>
        </div>
        <button type="submit"
          className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:bg-primary/90">
          Filtrar
        </button>
        <Link href="/financiero" className="text-sm text-muted-foreground hover:underline py-1.5">
          Limpiar
        </Link>
      </form>

      <FinancieroSearchClient invoices={invoices} duplicatePairs={duplicatePairs} />
    </div>
  );
}
