"use client";

import { useState } from "react";
import { MarkPaidButton } from "./MarkPaidButton";
import { InvoiceEditModal } from "./InvoiceEditModal";
import { InvoiceDeleteButton } from "./InvoiceDeleteButton";
import { InvoiceDetailPanel } from "./InvoiceDetailPanel";
import { markInvoicePaidAction } from "@/modules/suppliers/actions/invoices";
import type { InvoiceRow } from "@/modules/suppliers/types";

interface Props {
  invoices: InvoiceRow[];
  supplierId: string;
  canWrite: boolean;
}

const Q_LABELS = [
  { label: "1.er trimestre", months: "Enero – marzo" },
  { label: "2.º trimestre",  months: "Abril – junio" },
  { label: "3.er trimestre", months: "Julio – septiembre" },
  { label: "4.º trimestre",  months: "Octubre – diciembre" },
];

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function quarterOf(dateStr: string): number {
  const m = parseInt(dateStr.split("-")[1], 10);
  return Math.ceil(m / 3);
}

function yearOf(dateStr: string): number {
  return parseInt(dateStr.split("-")[0], 10);
}

export function InvoiceYearQuarterView({ invoices, canWrite }: Props) {
  const now = new Date();
  const curYear = now.getFullYear();
  const curQ    = Math.ceil((now.getMonth() + 1) / 3);

  const years = [...new Set(invoices.map(i => yearOf(i.invoiceDate)))]
    .sort((a, b) => b - a);
  if (!years.includes(curYear)) years.unshift(curYear);

  const [selYear, setSelYear] = useState(years[0] ?? curYear);
  const [selQ, setSelQ]       = useState(() => {
    const yearInvs = invoices.filter(i => yearOf(i.invoiceDate) === (years[0] ?? curYear));
    const qs = [...new Set(yearInvs.map(i => quarterOf(i.invoiceDate)))].sort((a,b) => b-a);
    if (years[0] === curYear) return curQ;
    return qs[0] ?? 1;
  });

  const [editingInvoice, setEditingInvoice]   = useState<InvoiceRow | null>(null);
  const [detailInvoice,  setDetailInvoice]    = useState<InvoiceRow | null>(null);

  // Detectar duplicados
  const dupKeyCount = new Map<string, number>();
  for (const inv of invoices) {
    if (!inv.invoiceNumber) continue;
    const key = `${inv.invoiceNumber}|${inv.invoiceDate}|${inv.totalInCents}`;
    dupKeyCount.set(key, (dupKeyCount.get(key) ?? 0) + 1);
  }
  const isDuplicate = (inv: InvoiceRow) => {
    if (!inv.invoiceNumber) return false;
    const key = `${inv.invoiceNumber}|${inv.invoiceDate}|${inv.totalInCents}`;
    return (dupKeyCount.get(key) ?? 0) > 1;
  };

  const yearInvoices = invoices.filter(i => yearOf(i.invoiceDate) === selYear);
  const qInvoices    = yearInvoices.filter(i => quarterOf(i.invoiceDate) === selQ)
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));

  const countFor = (q: number) => yearInvoices.filter(i => quarterOf(i.invoiceDate) === q).length;

  const handleYearChange = (y: number) => {
    setSelYear(y);
    const qs = [...new Set(invoices.filter(i => yearOf(i.invoiceDate) === y).map(i => quarterOf(i.invoiceDate)))].sort((a,b)=>b-a);
    setSelQ(qs[0] ?? (y === curYear ? curQ : 4));
  };

  return (
    <div className="space-y-5">
      {/* Panel de detalle */}
      {detailInvoice && (
        <InvoiceDetailPanel
          invoice={detailInvoice}
          onClose={() => setDetailInvoice(null)}
        />
      )}

      {/* Modal de edición rápida */}
      {editingInvoice && (
        <InvoiceEditModal
          invoice={editingInvoice}
          onClose={() => setEditingInvoice(null)}
        />
      )}

      {/* Tabs de año */}
      <div className="flex gap-2 flex-wrap">
        {years.map(y => (
          <button
            key={y}
            type="button"
            onClick={() => handleYearChange(y)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              y === selYear
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Tarjetas de trimestre */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Q_LABELS.map((ql, idx) => {
          const q = idx + 1;
          const count = countFor(q);
          const isSelected = selQ === q;
          return (
            <button
              key={q}
              type="button"
              onClick={() => setSelQ(q)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                isSelected
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:bg-muted/50 text-foreground"
              }`}
            >
              <p className={`text-xs font-semibold ${isSelected ? "text-primary" : "text-muted-foreground"}`}>
                {ql.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{ql.months}</p>
              <p className={`text-sm font-medium mt-1.5 ${isSelected ? "text-primary" : ""}`}>
                {count} {count === 1 ? "factura" : "facturas"}
              </p>
            </button>
          );
        })}
      </div>

      {/* Tabla de facturas */}
      {qInvoices.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No hay facturas en este trimestre.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-xs text-muted-foreground uppercase tracking-wide">Fecha</th>
                <th className="px-4 py-3 text-left font-medium text-xs text-muted-foreground uppercase tracking-wide">Nº factura</th>
                <th className="px-4 py-3 text-left font-medium text-xs text-muted-foreground uppercase tracking-wide">Documento</th>
                <th className="px-4 py-3 text-right font-medium text-xs text-muted-foreground uppercase tracking-wide">Base</th>
                <th className="px-4 py-3 text-right font-medium text-xs text-muted-foreground uppercase tracking-wide">IVA</th>
                <th className="px-4 py-3 text-right font-medium text-xs text-muted-foreground uppercase tracking-wide">Total</th>
                <th className="px-4 py-3 text-left font-medium text-xs text-muted-foreground uppercase tracking-wide">Estado</th>
                {canWrite && <th className="px-4 py-3 text-right font-medium text-xs text-muted-foreground uppercase tracking-wide">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {qInvoices.map(inv => (
                <tr
                  key={inv.id}
                  className={`hover:bg-muted/20 transition-colors ${
                    isDuplicate(inv) ? "bg-red-50/40 dark:bg-red-900/10"
                    : inv.totalInCents < 0 ? "bg-orange-50/40 dark:bg-orange-900/10"
                    : ""
                  }`}
                >
                  <td className="px-4 py-3 text-sm tabular-nums">{inv.invoiceDate}</td>
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Nº factura clicable → abre panel de detalle */}
                      <button
                        type="button"
                        onClick={() => setDetailInvoice(inv)}
                        className="text-primary hover:underline font-medium text-left"
                        title="Ver detalle completo"
                      >
                        {inv.invoiceNumber ?? <span className="italic text-muted-foreground text-xs">Sin número</span>}
                      </button>
                      {isDuplicate(inv) && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
                          ⚠ Duplicada
                        </span>
                      )}
                      {inv.totalInCents < 0 && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400">
                          − Rectificativa
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {inv.bundleFileId ? (
                      <a href={`/api/files/bundles/${inv.bundleFileId}`} target="_blank" rel="noopener noreferrer"
                        className="text-primary hover:underline text-xs">
                        📄 Escáner {inv.bundleDate}
                      </a>
                    ) : inv.fileId ? (
                      <a href={`/api/files/invoices/${inv.fileId}`} target="_blank" rel="noopener noreferrer"
                        className="text-primary hover:underline text-xs">
                        📄 Ver PDF
                      </a>
                    ) : (
                      <span className="text-muted-foreground/60 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {inv.baseAmountInCents != null ? euros(inv.baseAmountInCents) : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground text-xs">
                    {inv.vatLines && inv.vatLines.length > 1 ? (
                      <span className="inline-flex items-center rounded-full bg-purple-50 dark:bg-purple-900/20 px-1.5 py-0.5 text-purple-700 dark:text-purple-300 font-medium text-xs">
                        {inv.vatLines.map(l => `${l.vatRate}%`).join(" · ")}
                      </span>
                    ) : inv.vatRate != null ? (
                      <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 text-blue-700 dark:text-blue-300 font-medium">
                        {inv.vatRate}%
                      </span>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {inv.totalInCents !== 0 ? (
                      <span className={inv.totalInCents < 0 ? "text-orange-600 dark:text-orange-400" : ""}>
                        {euros(inv.totalInCents)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        inv.isPaid
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      }`}>
                        {inv.isPaid ? "Archivada" : "Pendiente"}
                      </span>
                      {inv.gestoriaStatus ? (
                        <a href={`/gestoria/${inv.gestoriaPackageId}`} onClick={e => e.stopPropagation()}>
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 whitespace-nowrap">
                            📮 {inv.gestoriaStatus === "CONFIRMED" ? "Confirmada" : "En gestoría"} Q{inv.gestoriaPackageQuarter}/{inv.gestoriaPackageYear}
                          </span>
                        </a>
                      ) : (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 whitespace-nowrap">
                          ⏳ Pendiente gestoría
                        </span>
                      )}
                    </div>
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <MarkPaidButton invoiceId={inv.id} isPaid={inv.isPaid} action={markInvoicePaidAction} />
                        <button
                          type="button"
                          onClick={() => setEditingInvoice(inv)}
                          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          Editar
                        </button>
                        <InvoiceDeleteButton
                          invoiceId={inv.id}
                          invoiceNumber={inv.invoiceNumber}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
