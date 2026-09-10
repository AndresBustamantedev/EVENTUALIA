"use client";

/**
 * Panel lateral de detalle de factura.
 * Se abre al hacer clic en el Nº de factura en la tabla de facturas del proveedor.
 * Muestra todos los campos, desglose de IVA, líneas de producto y permite edición inline.
 */

import { useState, useEffect, useTransition } from "react";
import { updateInvoiceAction, getInvoiceLinesAction } from "@/modules/suppliers/actions/invoices";
import type { InvoiceRow, VatLineRow, InvoiceLineRow } from "@/modules/suppliers/types";

interface Props {
  invoice: InvoiceRow;
  onClose: () => void;
}

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function centsToEuros(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2);
}

function eurosToCents(str: string): number {
  const n = parseFloat(str.replace(",", "."));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

export function InvoiceDetailPanel({ invoice, onClose }: Props) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [lines, setLines] = useState<InvoiceLineRow[] | null>(null);
  const [loadingLines, setLoadingLines] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Estado editable
  const [fields, setFields] = useState({
    invoiceNumber: invoice.invoiceNumber ?? "",
    invoiceDate:   invoice.invoiceDate,
    dueDate:       invoice.dueDate ?? "",
    totalEuros:    centsToEuros(invoice.totalInCents),
    taxEuros:      centsToEuros(invoice.taxInCents),
    notes:         invoice.notes ?? "",
    isPaid:        invoice.isPaid,
  });
  const [vatLines, setVatLines] = useState<VatLineRow[]>(invoice.vatLines ?? []);

  // Cargar líneas de producto al abrir
  useEffect(() => {
    setLoadingLines(true);
    getInvoiceLinesAction(invoice.id)
      .then(r => { setLines(r); setLoadingLines(false); })
      .catch(() => { setLines([]); setLoadingLines(false); });
  }, [invoice.id]);

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  function set(key: keyof typeof fields, value: string | boolean) {
    setFields(prev => ({ ...prev, [key]: value }));
  }

  // Totales derivados de vatLines
  const derivedBase  = vatLines.reduce((s, l) => s + l.baseAmountInCents, 0);
  const derivedTax   = vatLines.reduce((s, l) => s + l.taxInCents, 0);
  const derivedTotal = derivedBase + derivedTax;

  function addVatLine() {
    const used = new Set(vatLines.map(l => l.vatRate));
    const next = [4, 10, 21].find(r => !used.has(r)) ?? 21;
    setVatLines(prev => [...prev, { vatRate: next, baseAmountInCents: 0, taxInCents: 0 }]);
  }

  function removeVatLine(idx: number) {
    setVatLines(prev => prev.filter((_, i) => i !== idx));
  }

  function updateVatLine(idx: number, field: keyof VatLineRow, raw: string) {
    setVatLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      if (field === "vatRate") return { ...l, vatRate: parseFloat(raw) || 0 };
      const cents = Math.round((parseFloat(raw.replace(",", ".")) || 0) * 100);
      return { ...l, [field]: cents };
    }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const hasVatLines = vatLines.length > 0;
      const result = await updateInvoiceAction({
        invoiceId:     invoice.id,
        invoiceNumber: fields.invoiceNumber.trim() || null,
        invoiceDate:   fields.invoiceDate,
        dueDate:       fields.dueDate || null,
        totalInCents:  hasVatLines ? derivedTotal : eurosToCents(fields.totalEuros),
        taxInCents:    hasVatLines ? derivedTax : (fields.taxEuros ? eurosToCents(fields.taxEuros) : null),
        notes:         fields.notes.trim() || null,
        isPaid:        fields.isPaid,
        vatLines:      hasVatLines ? vatLines : undefined,
      });
      if (result.error) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  }

  // ── Sección: desglose de IVA (vista) ──────────────────────────
  const vatSection = () => {
    const displayLines = mode === "edit" ? vatLines : invoice.vatLines;
    if (!displayLines || displayLines.length === 0) {
      // Fallback: mostrar campos legacy si existen
      if (invoice.baseAmountInCents != null || invoice.taxInCents != null) {
        return (
          <div className="rounded-lg bg-muted/30 p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">IVA</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Base imponible</span>
              <span className="font-medium tabular-nums">{invoice.baseAmountInCents != null ? euros(invoice.baseAmountInCents) : "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Cuota IVA {invoice.vatRate != null ? `(${invoice.vatRate}%)` : ""}
              </span>
              <span className="font-medium tabular-nums">{invoice.taxInCents != null ? euros(invoice.taxInCents) : "—"}</span>
            </div>
          </div>
        );
      }
      return null;
    }
    return (
      <div className="rounded-lg bg-muted/30 p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Desglose IVA</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="text-left pb-1 font-medium">Tipo</th>
              <th className="text-right pb-1 font-medium">Base</th>
              <th className="text-right pb-1 font-medium">Cuota</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {displayLines.map((vl, i) => (
              <tr key={i}>
                <td className="py-1.5">
                  <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                    {vl.vatRate}%
                  </span>
                </td>
                <td className="text-right py-1.5 tabular-nums">{euros(vl.baseAmountInCents)}</td>
                <td className="text-right py-1.5 tabular-nums">{euros(vl.taxInCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t">
              <td className="pt-2 text-xs text-muted-foreground font-medium">Total</td>
              <td className="pt-2 text-right tabular-nums font-medium text-sm">
                {euros(displayLines.reduce((s, l) => s + l.baseAmountInCents, 0))}
              </td>
              <td className="pt-2 text-right tabular-nums font-medium text-sm">
                {euros(displayLines.reduce((s, l) => s + l.taxInCents, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  // ── Sección: líneas de producto ──────────────────────────────
  const linesSection = () => {
    if (loadingLines) {
      return (
        <div className="rounded-lg bg-muted/30 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Líneas de producto</p>
          <p className="text-sm text-muted-foreground animate-pulse">Cargando…</p>
        </div>
      );
    }
    if (!lines || lines.length === 0) return null;
    return (
      <div className="rounded-lg bg-muted/30 p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Líneas de producto ({lines.length})
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[360px]">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left pb-1 font-medium">Descripción</th>
                <th className="text-right pb-1 font-medium">Cant.</th>
                <th className="text-right pb-1 font-medium">Precio u.</th>
                <th className="text-right pb-1 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {lines.map(line => (
                <tr key={line.id} className="hover:bg-muted/20">
                  <td className="py-2 pr-2">
                    <span className="font-medium">{line.productName ?? line.rawDescription}</span>
                    {line.productName && line.rawDescription !== line.productName && (
                      <p className="text-xs text-muted-foreground">{line.rawDescription}</p>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {line.quantity != null ? line.quantity.toLocaleString("es-ES") : "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {line.unitPriceInCents != null ? euros(line.unitPriceInCents) : "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {line.totalInCents != null ? euros(line.totalInCents) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />


      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-card rounded-2xl border shadow-2xl overflow-hidden">
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b shrink-0 bg-card">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground mb-0.5">{invoice.supplierName}</p>
            <h2 className="text-lg font-bold leading-tight truncate">
              {invoice.invoiceNumber
                ? `Factura ${invoice.invoiceNumber}`
                : <span className="italic text-muted-foreground">Sin número</span>
              }
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{invoice.invoiceDate}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* PDF link */}
            {(invoice.bundleFileId || invoice.fileId) && (
              <a
                href={invoice.bundleFileId
                  ? `/api/files/bundles/${invoice.bundleFileId}`
                  : `/api/files/invoices/${invoice.fileId}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
              >
                📄 PDF
              </a>
            )}
            {mode === "view" ? (
              <button
                type="button"
                onClick={() => setMode("edit")}
                className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                ✏ Editar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setMode("view"); setError(null); setVatLines(invoice.vatLines ?? []); }}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-lg leading-none"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── MODO VISTA ──────────────────────────── */}
          {mode === "view" && (
            <>
              {/* Datos principales */}
              <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Nº factura</p>
                    <p className="text-sm font-medium">
                      {invoice.invoiceNumber ?? <span className="italic text-muted-foreground">Sin número</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Estado</p>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      invoice.isPaid
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    }`}>
                      {invoice.isPaid ? "✓ Archivada" : "⏳ Pendiente"}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Fecha factura</p>
                    <p className="text-sm font-medium">{invoice.invoiceDate}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Vencimiento</p>
                    <p className="text-sm font-medium">{invoice.dueDate ?? <span className="text-muted-foreground">—</span>}</p>
                  </div>
                  {invoice.paidAt && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Pagada el</p>
                      <p className="text-sm font-medium">{new Date(invoice.paidAt).toLocaleDateString("es-ES")}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Total</p>
                    <p className={`text-sm font-bold ${invoice.totalInCents < 0 ? "text-orange-600 dark:text-orange-400" : ""}`}>
                      {invoice.totalInCents !== 0 ? euros(invoice.totalInCents) : "—"}
                    </p>
                  </div>
                </div>
                {invoice.notes && (
                  <div className="border-t border-border/50 pt-3">
                    <p className="text-xs text-muted-foreground mb-0.5">Notas</p>
                    <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
                  </div>
                )}
              </div>

              {vatSection()}
              {linesSection()}
            </>
          )}

          {/* ── MODO EDICIÓN ─────────────────────────── */}
          {mode === "edit" && (
            <form id="invoice-detail-edit" onSubmit={handleSave} className="space-y-4">
              {error && (
                <p className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Nº factura</label>
                  <input
                    type="text"
                    value={fields.invoiceNumber}
                    onChange={e => set("invoiceNumber", e.target.value)}
                    placeholder="Sin número"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Fecha factura *</label>
                  <input
                    type="date"
                    value={fields.invoiceDate}
                    onChange={e => set("invoiceDate", e.target.value)}
                    required
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Fecha vencimiento</label>
                <input
                  type="date"
                  value={fields.dueDate}
                  onChange={e => set("dueDate", e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Desglose IVA editable */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Desglose IVA</label>
                  {vatLines.length < 3 && (
                    <button
                      type="button"
                      onClick={addVatLine}
                      className="text-xs text-primary hover:underline"
                    >
                      + Añadir tipo
                    </button>
                  )}
                </div>
                {vatLines.length > 0 ? (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">IVA %</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Base (€)</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Cuota (€)</th>
                          <th className="px-2 py-2 w-6"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {vatLines.map((vl, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2">
                              <select
                                value={vl.vatRate}
                                onChange={e => updateVatLine(idx, "vatRate", e.target.value)}
                                className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                              >
                                {[4, 10, 21].map(r => (
                                  <option key={r} value={r} disabled={vatLines.some((l, i) => i !== idx && l.vatRate === r)}>{r}%</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number" step="0.01" min="0"
                                value={centsToEuros(vl.baseAmountInCents)}
                                onChange={e => updateVatLine(idx, "baseAmountInCents", e.target.value)}
                                className="w-full rounded border border-input bg-background px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number" step="0.01" min="0"
                                value={centsToEuros(vl.taxInCents)}
                                onChange={e => updateVatLine(idx, "taxInCents", e.target.value)}
                                className="w-full rounded border border-input bg-background px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <button type="button" onClick={() => removeVatLine(idx)}
                                className="text-muted-foreground hover:text-destructive text-xs">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/20 border-t">
                        <tr>
                          <td className="px-3 py-2 text-xs text-muted-foreground font-medium">Total</td>
                          <td className="px-3 py-2 text-right text-sm font-bold tabular-nums">{euros(derivedBase)}</td>
                          <td className="px-3 py-2 text-right text-sm font-bold tabular-nums">{euros(derivedTax)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  /* Sin vatLines: mostrar total e IVA manual */
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Total (€) *</label>
                      <input
                        type="number" step="0.01"
                        value={fields.totalEuros}
                        onChange={e => set("totalEuros", e.target.value)}
                        required
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">IVA (€)</label>
                      <input
                        type="number" step="0.01"
                        value={fields.taxEuros}
                        onChange={e => set("taxEuros", e.target.value)}
                        placeholder="Opcional"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </div>
                )}
                {vatLines.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Total calculado: <strong className="text-foreground">{euros(derivedTotal)}</strong>
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Notas</label>
                <textarea
                  value={fields.notes}
                  onChange={e => set("notes", e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={fields.isPaid}
                  onChange={e => set("isPaid", e.target.checked)}
                  className="rounded"
                />
                Marcar como pagada / archivada
              </label>

              {/* Líneas de producto (sólo lectura en modo edición) */}
              {linesSection()}
            </form>
          )}
        </div>

        {/* Pie: botón guardar en modo edición */}
        {mode === "edit" && (
          <div className="shrink-0 border-t bg-card px-5 py-4 flex gap-2">
            <button
              type="submit"
              form="invoice-detail-edit"
              disabled={isPending}
              className="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Guardando…" : "Guardar cambios"}
            </button>
            <button
              type="button"
              onClick={() => { setMode("view"); setError(null); setVatLines(invoice.vatLines ?? []); }}
              className="rounded-md border border-border px-4 py-2.5 text-sm hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
      </div>
    </>
  );
}
