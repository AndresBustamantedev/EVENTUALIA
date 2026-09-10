"use client";

/**
 * Modal para editar los campos básicos de una factura ya registrada.
 * Soporta desglose IVA múltiple (vatLines).
 */
import { useState, useTransition } from "react";
import { updateInvoiceAction } from "@/modules/suppliers/actions/invoices";
import type { InvoiceRow, VatLineRow } from "@/modules/suppliers/types";

interface Props {
  invoice: InvoiceRow;
  onClose: () => void;
  onSuccess?: () => void;
}

const IC = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function centsToEuros(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2);
}

function eurosToCents(str: string): number {
  const n = parseFloat(str.replace(",", "."));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

const VAT_RATES = [4, 10, 21] as const;

export function InvoiceEditModal({ invoice, onClose, onSuccess }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [fields, setFields] = useState({
    invoiceNumber: invoice.invoiceNumber ?? "",
    invoiceDate:   invoice.invoiceDate,
    dueDate:       invoice.dueDate ?? "",
    totalEuros:    centsToEuros(invoice.totalInCents),
    notes:         invoice.notes ?? "",
    isPaid:        invoice.isPaid,
  });

  // Desglose IVA — inicializar desde vatLines existentes o vacío
  const [vatLines, setVatLines] = useState<VatLineRow[]>(
    invoice.vatLines && invoice.vatLines.length > 0 ? [...invoice.vatLines] : []
  );

  function set(key: keyof typeof fields, value: string | boolean) {
    setFields(prev => ({ ...prev, [key]: value }));
  }

  function updateLine(idx: number, field: keyof VatLineRow, raw: string) {
    setVatLines(prev => {
      const next = [...prev];
      if (field === "vatRate") {
        next[idx] = { ...next[idx], vatRate: parseFloat(raw) || 0 };
      } else {
        next[idx] = { ...next[idx], [field]: eurosToCents(raw) };
      }
      return next;
    });
  }

  function addLine() {
    const usedRates = new Set(vatLines.map(l => l.vatRate));
    const nextRate = VAT_RATES.find(r => !usedRates.has(r)) ?? 21;
    setVatLines(prev => [...prev, { vatRate: nextRate, baseAmountInCents: 0, taxInCents: 0 }]);
  }

  function removeLine(idx: number) {
    setVatLines(prev => prev.filter((_, i) => i !== idx));
  }

  const derivedBase  = vatLines.reduce((s, l) => s + l.baseAmountInCents, 0);
  const derivedTax   = vatLines.reduce((s, l) => s + l.taxInCents, 0);
  const derivedTotal = vatLines.length > 0 ? derivedBase + derivedTax : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const totalInCents = derivedTotal ?? eurosToCents(fields.totalEuros);
    startTransition(async () => {
      const result = await updateInvoiceAction({
        invoiceId:    invoice.id,
        invoiceNumber: fields.invoiceNumber.trim() || null,
        invoiceDate:  fields.invoiceDate,
        dueDate:      fields.dueDate || null,
        totalInCents,
        taxInCents:   vatLines.length > 0 ? derivedTax : null,
        notes:        fields.notes.trim() || null,
        isPaid:       fields.isPaid,
        vatLines:     vatLines.length > 0 ? vatLines : undefined,
      });
      if (result.error) {
        setError(result.error);
      } else {
        onSuccess?.();
        onClose();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card rounded-xl border shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h2 className="font-semibold text-base">Editar factura</h2>
          <button type="button" onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl leading-none">✕</button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nº factura</label>
              <input type="text" value={fields.invoiceNumber}
                onChange={e => set("invoiceNumber", e.target.value)}
                placeholder="Sin número" className={IC} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Fecha factura *</label>
              <input type="date" value={fields.invoiceDate}
                onChange={e => set("invoiceDate", e.target.value)}
                required className={IC} />
            </div>
          </div>

          {/* Total */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Total (€) *</label>
            <input type="number" step="0.01"
              value={derivedTotal != null ? centsToEuros(derivedTotal) : fields.totalEuros}
              readOnly={derivedTotal != null}
              onChange={e => set("totalEuros", e.target.value)}
              required className={IC + (derivedTotal != null ? " bg-muted cursor-not-allowed" : "")} />
            {derivedTotal != null && (
              <p className="text-xs text-muted-foreground">
                Calculado del desglose: {centsToEuros(derivedBase)} base + {centsToEuros(derivedTax)} IVA
              </p>
            )}
          </div>

          {/* Desglose IVA */}
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Desglose IVA</p>
              <button type="button" onClick={addLine}
                disabled={vatLines.length >= 3 || isPending}
                className="text-xs text-primary hover:underline disabled:opacity-40">
                + Añadir tipo
              </button>
            </div>

            {vatLines.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Sin desglose registrado.</p>
            )}

            {vatLines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-[90px_1fr_1fr_28px] gap-2 items-end">
                {idx === 0 && <>
                  <p className="text-xs text-muted-foreground col-span-1">IVA %</p>
                  <p className="text-xs text-muted-foreground">Base (€)</p>
                  <p className="text-xs text-muted-foreground">Cuota (€)</p>
                  <span />
                </>}
                <select value={line.vatRate}
                  onChange={e => updateLine(idx, "vatRate", e.target.value)}
                  className={IC} disabled={isPending}>
                  {VAT_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                </select>
                <input type="number" step="0.01"
                  value={centsToEuros(line.baseAmountInCents)}
                  onChange={e => updateLine(idx, "baseAmountInCents", e.target.value)}
                  className={IC} disabled={isPending} placeholder="0.00" />
                <input type="number" step="0.01"
                  value={centsToEuros(line.taxInCents)}
                  onChange={e => updateLine(idx, "taxInCents", e.target.value)}
                  className={IC} disabled={isPending} placeholder="0.00" />
                <button type="button" onClick={() => removeLine(idx)}
                  className="text-muted-foreground hover:text-destructive text-xl leading-none pb-1">×</button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Fecha vencimiento</label>
              <input type="date" value={fields.dueDate}
                onChange={e => set("dueDate", e.target.value)} className={IC} />
            </div>
            <div className="space-y-1 flex items-end pb-0.5">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={fields.isPaid}
                  onChange={e => set("isPaid", e.target.checked)} className="rounded" />
                Marcar como pagada
              </label>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Notas</label>
            <textarea value={fields.notes}
              onChange={e => set("notes", e.target.value)}
              rows={2} className={IC + " resize-none"} />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={isPending}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {isPending ? "Guardando…" : "Guardar cambios"}
            </button>
            <button type="button" onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
