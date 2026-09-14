"use client";

/**
 * Buscador en tiempo real para la página /financiero.
 * Filtra las facturas ya cargadas por proveedor, nº factura, importe y fecha.
 * Al hacer clic en el Nº de factura se abre el panel de detalle lateral.
 */
import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import type { InvoiceRow } from "@/modules/suppliers/types";
import type { DuplicatePair } from "@/modules/suppliers/actions/alerts";
import { dismissPairAction, dismissZeroInvoiceAction } from "@/modules/suppliers/actions/alerts";
import { InvoiceDetailPanel } from "@/modules/suppliers/components/InvoiceDetailPanel";

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function quarterOf(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getMonth() + 1) / 3);
}

function formatEurosShort(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

interface Props {
  invoices: InvoiceRow[];
  duplicatePairs?: DuplicatePair[];
  alertFilter?: string;
  dismissedZeroIds?: string[];
}

export function FinancieroSearchClient({
  invoices,
  duplicatePairs = [],
  alertFilter = "",
  dismissedZeroIds = [],
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);

  // Estado para duplicados descartados (pairKey)
  const [dismissedPairKeys, setDismissedPairKeys] = useState<Set<string>>(new Set());
  const [, startDismissPair] = useTransition();

  // Estado para facturas 0€ descartadas
  const [dismissedZeroSet, setDismissedZeroSet] = useState<Set<string>>(
    new Set(dismissedZeroIds)
  );
  const [, startDismissZero] = useTransition();

  const activePairs = duplicatePairs.filter(p => !dismissedPairKeys.has(p.pairKey));

  function handleDismissPair(pair: DuplicatePair) {
    setDismissedPairKeys(prev => new Set([...prev, pair.pairKey]));
    startDismissPair(async () => {
      await dismissPairAction(pair.invoiceId1, pair.invoiceId2);
    });
  }

  function handleDismissZero(invoiceId: string) {
    setDismissedZeroSet(prev => new Set([...prev, invoiceId]));
    startDismissZero(async () => {
      await dismissZeroInvoiceAction(invoiceId);
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return invoices;

    const asNumber = parseFloat(q.replace(",", "."));
    const isAmount = !isNaN(asNumber);

    return invoices.filter((inv) => {
      if (inv.supplierName.toLowerCase().includes(q)) return true;
      if (inv.invoiceNumber?.toLowerCase().includes(q)) return true;
      if (inv.invoiceDate.includes(q)) return true;
      if (isAmount) {
        const invEuros = Math.abs(inv.totalInCents / 100);
        if (Math.abs(invEuros - Math.abs(asNumber)) < 0.005) return true;
      }
      const eurosStr = (inv.totalInCents / 100).toFixed(2).replace(".", ",");
      if (eurosStr.includes(q)) return true;
      return false;
    });
  }, [invoices, query]);

  // Para zero_amount: ocultar en tabla las que ya se descartaron en esta sesión
  const visibleInvoices = useMemo(() => {
    if (alertFilter !== "zero_amount") return filtered;
    return filtered.filter(i => !dismissedZeroSet.has(i.id));
  }, [filtered, alertFilter, dismissedZeroSet]);

  const totalCents     = visibleInvoices.reduce((s, i) => s + i.totalInCents, 0);
  const pendienteCents = visibleInvoices.filter((i) => !i.isPaid).reduce((s, i) => s + i.totalInCents, 0);
  const pagadoCents    = visibleInvoices.filter((i) => i.isPaid).reduce((s, i) => s + i.totalInCents, 0);

  return (
    <>
      <div className="space-y-5">

        {/* ── Panel de pares duplicados ── */}
        {activePairs.length > 0 && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 overflow-hidden">
            <div className="bg-amber-50 dark:bg-amber-900/20 px-4 py-2.5 text-sm font-medium text-amber-800 dark:text-amber-300 border-b border-amber-200 dark:border-amber-800">
              🔁 {activePairs.length} par{activePairs.length !== 1 ? "es" : ""} sospechoso{activePairs.length !== 1 ? "s" : ""} — marca los que ya revisaste
            </div>
            <div className="divide-y divide-amber-100 dark:divide-amber-900/30">
              {activePairs.map(pair => (
                <div key={pair.pairKey} className="flex items-center justify-between gap-4 px-4 py-3 bg-white dark:bg-transparent">
                  <div className="text-sm min-w-0">
                    <span className="font-medium truncate block">{pair.supplierName}</span>
                    <span className="text-muted-foreground text-xs">
                      {formatEurosShort(pair.totalInCents)} € · {fmtDate(pair.date1)} y {fmtDate(pair.date2)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDismissPair(pair)}
                    className="shrink-0 rounded-md border border-green-300 dark:border-green-700 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors whitespace-nowrap"
                  >
                    ✓ No son duplicados
                  </button>
                </div>
              ))}
            </div>
            {activePairs.length === 0 && (
              <p className="px-4 py-3 text-sm text-muted-foreground">✓ Todos los pares revisados.</p>
            )}
          </div>
        )}

        {/* Buscador */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">🔍</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por proveedor, nº factura, importe (ej: 130,89) o fecha (ej: 2026-08)…"
            className="w-full rounded-lg border border-input bg-background pl-9 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { label: "Total filtrado",  value: formatEuros(totalCents),     sub: `${visibleInvoices.length} factura${visibleInvoices.length !== 1 ? "s" : ""}` },
            { label: "Pendiente pago",  value: formatEuros(pendienteCents), sub: `${visibleInvoices.filter(i=>!i.isPaid).length} factura${visibleInvoices.filter(i=>!i.isPaid).length !== 1 ? "s" : ""}` },
            { label: "Pagado",          value: formatEuros(pagadoCents),    sub: `${visibleInvoices.filter(i=>i.isPaid).length} factura${visibleInvoices.filter(i=>i.isPaid).length !== 1 ? "s" : ""}` },
          ].map((card) => (
            <div key={card.label} className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
              <p className="text-xl font-bold">{card.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Tabla */}
        {visibleInvoices.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center">
            <p className="text-muted-foreground text-sm">
              {query ? `Sin resultados para "${query}".` : "No hay facturas con los filtros actuales."}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-xs text-muted-foreground text-left">
                    <th className="px-4 py-2.5 font-medium">Proveedor</th>
                    <th className="px-4 py-2.5 font-medium">Nº factura</th>
                    <th className="px-4 py-2.5 font-medium">Fecha</th>
                    <th className="px-4 py-2.5 font-medium">T</th>
                    <th className="px-4 py-2.5 font-medium text-right">Total</th>
                    <th className="px-4 py-2.5 font-medium text-center">Pago</th>
                    <th className="px-4 py-2.5 font-medium text-right">PDF</th>
                    {alertFilter === "zero_amount" && (
                      <th className="px-4 py-2.5 font-medium text-right">Acción</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleInvoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className={`hover:bg-muted/20 transition-colors ${
                        inv.totalInCents < 0 ? "bg-orange-50/40 dark:bg-orange-900/10" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/suppliers/${inv.supplierId}?tab=facturas`}
                          className="hover:underline text-primary"
                        >
                          {inv.supplierName}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setSelectedInvoice(inv)}
                            className="text-primary hover:underline text-left cursor-pointer"
                            title="Ver detalle de la factura"
                          >
                            {inv.invoiceNumber ?? (
                              <span className="text-muted-foreground/60 text-xs italic">Sin nº</span>
                            )}
                          </button>
                          {inv.totalInCents < 0 && (
                            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400">
                              − Rectif.
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{inv.invoiceDate}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{quarterOf(inv.invoiceDate)}T</td>
                      <td className={`px-4 py-2.5 text-right font-mono font-medium ${
                        inv.totalInCents < 0 ? "text-orange-600 dark:text-orange-400" : ""
                      }`}>
                        {formatEuros(inv.totalInCents)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {inv.isPaid
                          ? <span className="text-xs text-green-600 dark:text-green-400 font-medium">Pagada</span>
                          : <span className="text-xs text-amber-600 dark:text-amber-400">Pendiente</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {inv.fileId ? (
                          <a
                            href={`/api/files/invoices/${inv.fileId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            PDF
                          </a>
                        ) : inv.bundleFileId ? (
                          <a
                            href={`/api/files/bundles/${inv.bundleFileId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                            title={`Escáner ${inv.bundleDate ?? ""}`}
                          >
                            PDF
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      {alertFilter === "zero_amount" && (
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleDismissZero(inv.id)}
                            className="text-xs rounded-md border border-green-300 dark:border-green-700 px-2 py-1 font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors whitespace-nowrap"
                          >
                            ✓ Correcto
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Panel de detalle lateral */}
      {selectedInvoice && (
        <InvoiceDetailPanel
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </>
  );
}
