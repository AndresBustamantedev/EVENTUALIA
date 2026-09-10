"use client";

import { useActionState, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { IssuedInvoiceFormState, IssuedInvoiceRow } from "../types";

interface Line {
  description: string;
  qty: string;
  price: string;
  vat: string;
}

const emptyLine = (): Line => ({ description: "", qty: "1", price: "", vat: "10" });

function calcLine(l: Line) {
  const qty = parseFloat(l.qty) || 0;
  const price = parseFloat(l.price) || 0;
  const vat = parseFloat(l.vat) || 0;
  const base = qty * price;
  const vatAmt = base * vat / 100;
  return { base, vatAmt, total: base + vatAmt };
}

function fmt(n: number) {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const VAT_OPTIONS = ["4", "10", "21"];

interface Props {
  action: (prev: IssuedInvoiceFormState, formData: FormData) => Promise<IssuedInvoiceFormState>;
  initialData?: IssuedInvoiceRow | null;
  mode: "create" | "edit" | "rectificativa";
  originalNumber?: string;
}

export function IssuedInvoiceForm({ action, initialData, mode, originalNumber }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(action, {});

  const today = new Date().toISOString().split("T")[0];

  const [lines, setLines] = useState<Line[]>(() => {
    if (initialData?.lines.length) {
      return initialData.lines.map(l => ({
        description: l.description,
        qty: String(l.quantity),
        price: (l.unitPriceInCents / 100).toFixed(2),
        vat: String(l.vatRate),
      }));
    }
    return [emptyLine()];
  });

  useEffect(() => {
    if (state.success && state.id) {
      router.push(`/facturas-emitidas/${state.id}`);
    }
  }, [state, router]);

  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (i: number) => setLines(prev => prev.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof Line, value: string) =>
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  const totals = lines.reduce((acc, l) => {
    const { base, vatAmt, total } = calcLine(l);
    return { base: acc.base + base, vat: acc.vat + vatAmt, total: acc.total + total };
  }, { base: 0, vat: 0, total: 0 });

  const titleMap = { create: "Nueva factura", edit: "Editar factura", rectificativa: "Nueva rectificativa" };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{titleMap[mode]}</h1>
        {mode === "rectificativa" && originalNumber && (
          <p className="text-sm text-amber-600 mt-1">Rectifica la factura: <strong>{originalNumber}</strong></p>
        )}
      </div>

      <form action={formAction} className="space-y-6">
        {/* ── Hidden inputs para las líneas (fuera de la tabla) ── */}
        <div hidden aria-hidden="true">
          {lines.map((l, i) => (
            <span key={i}>
              <input type="hidden" name={`line_${i}_desc`} value={l.description} />
              <input type="hidden" name={`line_${i}_qty`} value={l.qty} />
              <input type="hidden" name={`line_${i}_price`} value={l.price} />
              <input type="hidden" name={`line_${i}_vat`} value={l.vat} />
            </span>
          ))}
        </div>

        {/* ── Datos de la factura ── */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Datos de la factura</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="invoiceNumber">
                Número de factura <span className="text-destructive">*</span>
              </label>
              <input
                id="invoiceNumber" name="invoiceNumber" required
                defaultValue={initialData?.invoiceNumber ?? ""}
                placeholder="F26001"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="issueDate">
                Fecha <span className="text-destructive">*</span>
              </label>
              <input
                id="issueDate" name="issueDate" type="date" required
                defaultValue={initialData?.issueDate ?? today}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* ── Cliente ── */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Cliente</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 col-span-2">
              <label className="text-sm font-medium" htmlFor="clientName">
                Nombre / Razón social <span className="text-destructive">*</span>
              </label>
              <input
                id="clientName" name="clientName" required
                defaultValue={initialData?.clientName ?? ""}
                placeholder="Empresa S.L."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="clientNif">NIF / CIF</label>
              <input
                id="clientNif" name="clientNif"
                defaultValue={initialData?.clientNif ?? ""}
                placeholder="B12345678"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="clientAddress">Dirección</label>
              <input
                id="clientAddress" name="clientAddress"
                defaultValue={initialData?.clientAddress ?? ""}
                placeholder="Calle Mayor 1, 28001 Madrid"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="clientPhone">Teléfono</label>
              <input
                id="clientPhone" name="clientPhone"
                defaultValue={initialData?.clientPhone ?? ""}
                placeholder="+34 600 000 000"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="clientEmail">
                Email <span className="text-xs text-muted-foreground">(para envío posterior)</span>
              </label>
              <input
                id="clientEmail" name="clientEmail" type="email"
                defaultValue={initialData?.clientEmail ?? ""}
                placeholder="cliente@empresa.com"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* ── Líneas ── */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Líneas</h2>
            <button type="button" onClick={addLine}
              className="text-sm text-primary hover:underline font-medium">
              + Añadir línea
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs uppercase">
                  <th className="text-left pb-2 pr-2">Descripción</th>
                  <th className="text-right pb-2 px-2 w-28">Precio (€)</th>
                  <th className="text-right pb-2 px-2 w-16">Cant.</th>
                  <th className="text-right pb-2 px-2 w-20">IVA %</th>
                  <th className="text-right pb-2 px-2 w-24">Base</th>
                  <th className="text-right pb-2 px-2 w-24">IVA (€)</th>
                  <th className="pb-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {lines.map((l, i) => {
                  const { base, vatAmt } = calcLine(l);
                  return (
                    <tr key={i}>
                      <td className="py-2 pr-2">
                        <input
                          value={l.description}
                          onChange={e => updateLine(i, "description", e.target.value)}
                          placeholder="Servicio de comida (MENÚ)"
                          className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number" step="0.01" min="0"
                          value={l.price}
                          onChange={e => updateLine(i, "price", e.target.value)}
                          placeholder="0.00"
                          className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number" step="0.001" min="0"
                          value={l.qty}
                          onChange={e => updateLine(i, "qty", e.target.value)}
                          className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <select
                          value={l.vat}
                          onChange={e => updateLine(i, "vat", e.target.value)}
                          className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          {VAT_OPTIONS.map(v => <option key={v} value={v}>{v}%</option>)}
                        </select>
                      </td>
                      <td className="py-2 px-2 text-right text-muted-foreground tabular-nums">{fmt(base)}</td>
                      <td className="py-2 px-2 text-right text-muted-foreground tabular-nums">{fmt(vatAmt)}</td>
                      <td className="py-2 pl-2 text-center">
                        {lines.length > 1 && (
                          <button type="button" onClick={() => removeLine(i)}
                            className="text-muted-foreground hover:text-destructive text-xl leading-none">
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totales en tiempo real */}
          <div className="flex justify-end pt-2 border-t border-border">
            <div className="text-sm space-y-1 text-right">
              <div className="flex gap-8 text-muted-foreground">
                <span>Base imponible</span>
                <span className="font-mono w-28 text-right">{fmt(totals.base)} €</span>
              </div>
              <div className="flex gap-8 text-muted-foreground">
                <span>Total IVA</span>
                <span className="font-mono w-28 text-right">{fmt(totals.vat)} €</span>
              </div>
              <div className="flex gap-8 font-bold text-base">
                <span>Total a pagar</span>
                <span className="font-mono w-28 text-right">{fmt(totals.total)} €</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Notas ── */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-2">
          <label className="text-sm font-medium" htmlFor="notes">Notas (opcional)</label>
          <textarea
            id="notes" name="notes" rows={2}
            defaultValue={initialData?.notes ?? ""}
            placeholder="Observaciones internas o para el cliente..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        {state.error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
            {state.error}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={() => router.back()}
            className="rounded-md border border-border px-5 py-2 text-sm hover:bg-muted">
            Cancelar
          </button>
          <button type="submit" disabled={isPending}
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
            {isPending
              ? "Guardando…"
              : mode === "create" ? "Crear factura"
              : mode === "rectificativa" ? "Crear rectificativa"
              : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}
