"use client";

import { useState } from "react";
import Link from "next/link";
import { ClickableRow } from "@/components/ClickableRow";
import type { IssuedInvoiceRow } from "../types";
import { STATUS_LABELS, STATUS_COLORS } from "../types";

function fmt(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function getQuarter(iso: string): number {
  const month = parseInt(iso.split("-")[1], 10);
  return Math.ceil(month / 3);
}

function getYear(iso: string): number {
  return parseInt(iso.split("-")[0], 10);
}

const QUARTER_LABELS = [
  { q: 1, label: "1.er trimestre", months: "Enero – marzo" },
  { q: 2, label: "2.º trimestre", months: "Abril – junio" },
  { q: 3, label: "3.er trimestre", months: "Julio – septiembre" },
  { q: 4, label: "4.º trimestre", months: "Octubre – diciembre" },
];

interface Props {
  invoices: IssuedInvoiceRow[];
  canWrite: boolean;
}

export function IssuedInvoicesClient({ invoices, canWrite }: Props) {
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");

  // Collect all years
  const allYears = Array.from(new Set(invoices.map(i => getYear(i.issueDate)))).sort((a, b) => b - a);
  const currentYear = new Date().getFullYear();
  const defaultYear = allYears.includes(currentYear) ? currentYear : (allYears[0] ?? currentYear);

  const [selectedYear, setSelectedYear] = useState<number>(defaultYear);
  const [selectedQuarter, setSelectedQuarter] = useState<number | null>(
    () => getQuarter(new Date().toISOString().split("T")[0])
  );

  const filtered = (statusFilter === "ALL" ? invoices : invoices.filter(i => i.status === statusFilter))
    .filter(i => getYear(i.issueDate) === selectedYear)
    .filter(i => selectedQuarter === null || getQuarter(i.issueDate) === selectedQuarter);

  // Count per quarter for the current year + status filter
  const yearInvoices = (statusFilter === "ALL" ? invoices : invoices.filter(i => i.status === statusFilter))
    .filter(i => getYear(i.issueDate) === selectedYear);

  const quarterCounts = [1, 2, 3, 4].map(q => ({
    q,
    count: yearInvoices.filter(i => getQuarter(i.issueDate) === q).length,
  }));

  const totalsAll = filtered.reduce((acc, i) => ({
    base: acc.base + i.baseInCents,
    vat: acc.vat + i.vatInCents,
    total: acc.total + i.totalInCents,
  }), { base: 0, vat: 0, total: 0 });

  const [downloading, setDownloading] = useState(false);

  async function downloadZip() {
    if (!selectedQuarter) return;
    setDownloading(true);
    try {
      const url = `/api/files/issued-invoices-zip?year=${selectedYear}&quarter=${selectedQuarter}&status=${statusFilter}`;
      const res = await fetch(url);
      if (!res.ok) { alert("Error al generar el ZIP"); return; }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `facturas-${selectedYear}-T${selectedQuarter}.zip`;
      a.click();
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Facturas emitidas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{invoices.length} factura{invoices.length !== 1 ? "s" : ""} en total</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="ALL">Todas</option>
            <option value="ACTIVE">Activas</option>
            <option value="VOIDED">Anuladas</option>
            <option value="REPLACED">Sustituidas</option>
          </select>
          {canWrite && (
            <Link href="/facturas-emitidas/new"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90">
              + Nueva factura
            </Link>
          )}
        </div>
      </div>

      {/* Selector de año */}
      {allYears.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {allYears.map(y => (
            <button
              key={y}
              onClick={() => setSelectedYear(y)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                y === selectedYear
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      {/* Cards de trimestre */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {QUARTER_LABELS.map(({ q, label, months }) => {
          const count = quarterCounts.find(c => c.q === q)?.count ?? 0;
          const isSelected = selectedQuarter === q;
          return (
            <button
              key={q}
              onClick={() => setSelectedQuarter(isSelected ? null : q)}
              className={`text-left rounded-lg border p-4 transition-colors ${
                isSelected
                  ? "border-primary bg-primary/5 ring-2 ring-primary ring-offset-1"
                  : "border-border bg-card hover:bg-muted/30"
              }`}
            >
              <p className={`text-sm font-semibold ${isSelected ? "text-primary" : ""}`}>{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{months}</p>
              <p className={`text-sm font-bold mt-2 ${isSelected ? "text-primary" : ""}`}>
                {count} factura{count !== 1 ? "s" : ""}
              </p>
            </button>
          );
        })}
      </div>

      {/* Resumen 3 columnas */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Base imponible", value: fmt(totalsAll.base) },
            { label: "Total IVA", value: fmt(totalsAll.vat) },
            { label: "Total facturado", value: fmt(totalsAll.total) },
          ].map(card => (
            <div key={card.label} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{card.label}</p>
              <p className="text-xl font-bold mt-1">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabla + descarga ZIP */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-muted-foreground">
          No hay facturas para este período.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {/* Cabecera con botón ZIP */}
          <div className="flex items-center justify-between px-5 py-3 bg-muted/30 border-b border-border">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-sm">
                {selectedYear}{selectedQuarter ? ` — T${selectedQuarter}` : ""}
              </span>
              <span className="text-xs text-muted-foreground bg-background border border-border rounded px-2 py-0.5">
                {filtered.length} factura{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground hidden sm:block">
                Base: {fmt(totalsAll.base)} · Total: {fmt(totalsAll.total)}
              </span>
              {selectedQuarter && (
                <button
                  onClick={downloadZip}
                  disabled={downloading}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/50 disabled:opacity-50 transition-colors"
                >
                  {downloading ? (
                    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/>
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75"/>
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  )}
                  Descargar ZIP
                </button>
              )}
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr className="text-xs text-muted-foreground uppercase">
                <th className="text-left px-5 py-2 font-medium">Nº Factura</th>
                <th className="text-left px-4 py-2 font-medium">Fecha</th>
                <th className="text-left px-4 py-2 font-medium">Cliente</th>
                <th className="text-right px-4 py-2 font-medium">Base</th>
                <th className="text-right px-4 py-2 font-medium">IVA</th>
                <th className="text-right px-4 py-2 font-medium">Total</th>
                <th className="text-center px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(inv => (
                <ClickableRow key={inv.id} href={`/facturas-emitidas/${inv.id}`}
                  className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 font-mono font-medium">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(inv.issueDate)}</td>
                  <td className="px-4 py-3">
                    <div>{inv.clientName}</div>
                    {inv.clientNif && <div className="text-xs text-muted-foreground">{inv.clientNif}</div>}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmt(inv.baseInCents)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmt(inv.vatInCents)}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmt(inv.totalInCents)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[inv.status]}`}>
                      {STATUS_LABELS[inv.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/facturas-emitidas/${inv.id}`}
                      className="text-sm text-primary hover:underline">
                      Ver
                    </Link>
                  </td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
