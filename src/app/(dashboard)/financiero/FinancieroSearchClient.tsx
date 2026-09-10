"use client";

/**
 * Buscador en tiempo real para la página /financiero.
 * Filtra las facturas ya cargadas por proveedor, nº factura, importe y fecha.
 */
import { useState, useMemo } from "react";
import Link from "next/link";
import type { InvoiceRow } from "@/modules/suppliers/types";

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function quarterOf(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getMonth() + 1) / 3);
}

interface Props {
  invoices: InvoiceRow[];
}

export function FinancieroSearchClient({ invoices }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return invoices;

    // Intenta parsear como importe (ej: "22.24", "22,24", "-59")
    const asNumber = parseFloat(q.replace(",", "."));
    const isAmount = !isNaN(asNumber);

    return invoices.filter((inv) => {
      // Proveedor
      if (inv.supplierName.toLowerCase().includes(q)) return true;
      // Nº factura
      if (inv.invoiceNumber?.toLowerCase().includes(q)) return true;
      // Fecha (busca parcial: "2026-08", "08-31", "2026"...)
      if (inv.invoiceDate.includes(q)) return true;
      // Importe exacto o parcial (en euros, ej: "22.24" o "22,24")
      if (isAmount) {
        const invEuros = Math.abs(inv.totalInCents / 100);
        if (Math.abs(invEuros - Math.abs(asNumber)) < 0.005) return true;
      }
      // Importe como texto (ej: "130,89")
      const eurosStr = (inv.totalInCents / 100).toFixed(2).replace(".", ",");
      if (eurosStr.includes(q)) return true;

      return false;
    });
  }, [invoices, query]);

  const totalCents     = filtered.reduce((s, i) => s + i.totalInCents, 0);
  const pendienteCents = filtered.filter((i) => !i.isPaid).reduce((s, i) => s + i.totalInCents, 0);
  const pagadoCents    = filtered.filter((i) => i.isPaid).reduce((s, i) => s + i.totalInCents, 0);

  return (
    <div className="space-y-5">
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
          { label: "Total filtrado",  value: formatEuros(totalCents),     sub: `${filtered.length} factura${filtered.length !== 1 ? "s" : ""}` },
          { label: "Pendiente pago",  value: formatEuros(pendienteCents), sub: `${filtered.filter(i=>!i.isPaid).length} factura${filtered.filter(i=>!i.isPaid).length !== 1 ? "s" : ""}` },
          { label: "Pagado",          value: formatEuros(pagadoCents),    sub: `${filtered.filter(i=>i.isPaid).length} factura${filtered.filter(i=>i.isPaid).length !== 1 ? "s" : ""}` },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
            <p className="text-xl font-bold">{card.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabla */}
      {filtered.length === 0 ? (
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
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((inv) => (
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
                        <span className="text-muted-foreground">
                          {inv.invoiceNumber ?? (
                            <span className="text-muted-foreground/50 text-xs italic">Sin nº</span>
                          )}
                        </span>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
