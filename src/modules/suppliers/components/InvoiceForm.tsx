"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { InvoiceFormState, BundleRow, VatLineRow } from "../types";

const INPUT_CLASS = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";
const LABEL_CLASS = "block text-sm font-medium mb-1";
const ERROR_CLASS = "mt-1 text-xs text-destructive";

interface VatLineExtracted {
  vatRate: number;
  baseAmountInCents: number;
  taxInCents: number;
}

interface ExtractedFields {
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  supplierName?: string | null;
  supplierCif?: string | null;
  totalInCents?: number | null;
  vatLines?: VatLineExtracted[];
  // legacy
  baseAmountInCents?: number | null;
  vatRate?: number | null;
  vatAmountInCents?: number | null;
}

interface Props {
  supplierId: string;
  action: (prev: InvoiceFormState, formData: FormData) => Promise<InvoiceFormState>;
  onSuccess?: () => void;
  bundles?: BundleRow[];
}

function centsToDisplay(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function parseEuros(val: string): number {
  return Math.round(parseFloat(val.replace(",", ".") || "0") * 100);
}

const VAT_RATES = [4, 10, 21] as const;

function emptyLine(): VatLineRow {
  return { vatRate: 21, baseAmountInCents: 0, taxInCents: 0 };
}

function extractedToLines(extracted: ExtractedFields): VatLineRow[] {
  if (extracted.vatLines && extracted.vatLines.length > 0) {
    return extracted.vatLines.map(l => ({
      vatRate: l.vatRate,
      baseAmountInCents: l.baseAmountInCents,
      taxInCents: l.taxInCents,
    }));
  }
  // Fallback a campos legacy
  if (extracted.baseAmountInCents != null && extracted.vatAmountInCents != null) {
    return [{
      vatRate: extracted.vatRate ?? 21,
      baseAmountInCents: extracted.baseAmountInCents,
      taxInCents: extracted.vatAmountInCents,
    }];
  }
  return [];
}

export function InvoiceForm({ supplierId, action, onSuccess, bundles = [] }: Props) {
  const [state, formAction, isPending] = useActionState(action, {});
  const [key, setKey] = useState(0);

  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedFields | null>(null);

  // Desglose IVA
  const [vatLines, setVatLines] = useState<VatLineRow[]>([]);
  const [totalDisplay, setTotalDisplay] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derivar totales del desglose (declarado antes de los useEffects que los usan)
  const derivedBase = vatLines.reduce((s, l) => s + l.baseAmountInCents, 0);
  const derivedTax  = vatLines.reduce((s, l) => s + l.taxInCents, 0);
  const derivedTotal = vatLines.length > 0 ? derivedBase + derivedTax : null;

  useEffect(() => {
    if (state.success) {
      setKey((k) => k + 1);
      setOcrFile(null);
      setExtracted(null);
      setOcrError(null);
      setVatLines([]);
      setTotalDisplay("");
      onSuccess?.();
    }
  }, [state.success, onSuccess]);

  // Cuando llegan datos del OCR, poblar vatLines
  useEffect(() => {
    if (extracted) {
      const lines = extractedToLines(extracted);
      setVatLines(lines.length > 0 ? lines : []);
    }
  }, [extracted]);

  // Sincronizar totalDisplay con el desglose IVA calculado
  useEffect(() => {
    if (derivedTotal != null) {
      setTotalDisplay(centsToDisplay(derivedTotal));
    }
  }, [derivedTotal]);

  // Cuando llegan datos OCR sin líneas IVA, poblar totalDisplay desde totalInCents
  useEffect(() => {
    if (extracted?.totalInCents != null && vatLines.length === 0) {
      setTotalDisplay(centsToDisplay(extracted.totalInCents));
    }
  }, [extracted]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleExtract() {
    if (!ocrFile) return;
    setOcrLoading(true);
    setOcrError(null);
    try {
      const fd = new FormData();
      fd.append("file", ocrFile);
      const res = await fetch("/api/invoices/ocr", { method: "POST", body: fd });
      const json = await res.json() as { fields?: ExtractedFields; error?: string };
      if (!res.ok || json.error) {
        setOcrError(json.error ?? "Error al extraer los datos.");
      } else {
        setExtracted(json.fields ?? null);
      }
    } catch {
      setOcrError("Error de conexión al extraer datos.");
    } finally {
      setOcrLoading(false);
    }
  }

  function updateLine(idx: number, field: keyof VatLineRow, raw: string) {
    setVatLines(prev => {
      const next = [...prev];
      if (field === "vatRate") {
        next[idx] = { ...next[idx], vatRate: parseFloat(raw) || 0 };
      } else {
        const cents = parseEuros(raw);
        next[idx] = { ...next[idx], [field]: cents };
      }
      return next;
    });
  }

  function addLine() {
    // Añadir tipo que no esté ya en uso
    const usedRates = new Set(vatLines.map(l => l.vatRate));
    const nextRate = VAT_RATES.find(r => !usedRates.has(r)) ?? 21;
    setVatLines(prev => [...prev, { vatRate: nextRate, baseAmountInCents: 0, taxInCents: 0 }]);
  }

  function removeLine(idx: number) {
    setVatLines(prev => prev.filter((_, i) => i !== idx));
  }

  const fe = state.fieldErrors ?? {};
  const fieldError = (f: string) =>
    fe[f]?.[0] ? <p className={ERROR_CLASS}>{fe[f][0]}</p> : null;

  return (
    <form key={key} action={formAction} className="space-y-5">
      <input type="hidden" name="supplierId" value={supplierId} />

      {/* ── Sección OCR ─────────────────────────────────────── */}
      <div className="rounded-lg border border-dashed border-muted-foreground/40 bg-muted/20 p-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Extracción automática de datos
        </p>
        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
          <input
            ref={fileInputRef}
            type="file"
            name="file"
            accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
            className="text-sm file:mr-3 file:rounded file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20 flex-1"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setOcrFile(f);
              setExtracted(null);
              setOcrError(null);
            }}
          />
          <button
            type="button"
            disabled={!ocrFile || ocrLoading}
            onClick={handleExtract}
            className="shrink-0 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {ocrLoading ? "Extrayendo…" : "Extraer datos"}
          </button>
        </div>

        {ocrError && <p className="text-xs text-destructive">{ocrError}</p>}

        {extracted && (
          <div className="rounded border border-green-500/30 bg-green-500/5 px-3 py-2 text-xs text-green-700 dark:text-green-400 space-y-0.5">
            <p className="font-medium mb-1">✓ Datos extraídos — revisa y corrige si es necesario</p>
            {extracted.supplierName && (
              <p>Emisor: <span className="font-mono">{extracted.supplierName}</span>{extracted.supplierCif ? ` (${extracted.supplierCif})` : ""}</p>
            )}
            {vatLines.length > 1 && (
              <p>IVA múltiple detectado: {vatLines.map(l => `${l.vatRate}%`).join(", ")}</p>
            )}
          </div>
        )}
      </div>

      {/* ── Errores / éxito ─────────────────────────────────── */}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && (
        <p className="text-sm text-green-600 dark:text-green-400">Factura registrada correctamente.</p>
      )}

      {/* ── Campos principales ───────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Nº factura */}
        <div>
          <label htmlFor="invoiceNumber" className={LABEL_CLASS}>Nº factura</label>
          <input
            id="invoiceNumber" name="invoiceNumber" type="text"
            disabled={isPending} className={INPUT_CLASS}
            placeholder="2026-001"
            defaultValue={extracted?.invoiceNumber ?? ""}
            key={`num-${key}-${extracted?.invoiceNumber ?? ""}`}
          />
        </div>

        {/* Fecha */}
        <div>
          <label htmlFor="invoiceDate" className={LABEL_CLASS}>
            Fecha <span className="text-destructive">*</span>
          </label>
          <input
            id="invoiceDate" name="invoiceDate" type="date"
            required disabled={isPending} className={INPUT_CLASS}
            defaultValue={extracted?.invoiceDate ?? ""}
            key={`date-${key}-${extracted?.invoiceDate ?? ""}`}
          />
          {fieldError("invoiceDate")}
        </div>

        {/* Total */}
        <div>
          <label htmlFor="totalDisplay" className={LABEL_CLASS}>
            Total (€) <span className="text-destructive">*</span>
          </label>
          <input
            id="totalDisplay" type="number" step="0.01"
            required disabled={isPending} className={INPUT_CLASS} placeholder="0.00"
            value={totalDisplay}
            readOnly={derivedTotal != null}
            onChange={(e) => setTotalDisplay(e.target.value)}
          />
          <input
            type="hidden" name="totalInCents"
            value={String(parseEuros(totalDisplay) || 0)}
            readOnly
          />
          {derivedTotal != null && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Calculado del desglose IVA: {centsToDisplay(derivedBase)} + {centsToDisplay(derivedTax)} = {centsToDisplay(derivedTotal)} €
            </p>
          )}
          {fieldError("totalInCents")}
        </div>

        {/* Vencimiento */}
        <div>
          <label htmlFor="dueDate" className={LABEL_CLASS}>Vencimiento</label>
          <input id="dueDate" name="dueDate" type="date" disabled={isPending} className={INPUT_CLASS} />
        </div>

        {/* Pagada */}
        <div className="flex items-center gap-2 pt-5">
          <input id="isPaid" name="isPaid" type="checkbox" value="true" className="h-4 w-4" />
          <label htmlFor="isPaid" className="text-sm">Pagada</label>
          <input type="hidden" name="isPaid" value="false" />
        </div>

        {/* Notas */}
        <div className="sm:col-span-2">
          <label htmlFor="invNotes" className={LABEL_CLASS}>Notas</label>
          <textarea id="invNotes" name="notes" rows={2} disabled={isPending} className={INPUT_CLASS} />
        </div>

        {bundles.length > 0 && (
          <div className="sm:col-span-2">
            <label htmlFor="bundleId" className={LABEL_CLASS}>Vincular a escáner múltiple (opcional)</label>
            <select id="bundleId" name="bundleId" disabled={isPending} className={INPUT_CLASS}>
              <option value="">— Factura individual (sin bundle) —</option>
              {bundles.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.description ?? `Escáner ${b.bundleDate}`} · {b.bundleDate} · {b.invoiceCount} fact.
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Desglose IVA ─────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Desglose IVA</p>
          <button
            type="button"
            onClick={addLine}
            disabled={vatLines.length >= 3 || isPending}
            className="text-xs text-primary hover:underline disabled:opacity-40"
          >
            + Añadir tipo de IVA
          </button>
        </div>

        {vatLines.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            Sin desglose — el total se introducirá directamente arriba.
            Para facturas con IVA pulsa "Añadir tipo de IVA".
          </p>
        )}

        {vatLines.map((line, idx) => (
          <div key={idx} className="grid grid-cols-[100px_1fr_1fr_32px] gap-2 items-end">
            {/* Hidden inputs para el servidor */}
            <input type="hidden" name={`vatLine_${idx}_rate`} value={line.vatRate} />
            <input type="hidden" name={`vatLine_${idx}_base`} value={line.baseAmountInCents} />
            <input type="hidden" name={`vatLine_${idx}_tax`}  value={line.taxInCents} />

            <div>
              {idx === 0 && <p className="text-xs text-muted-foreground mb-1">IVA %</p>}
              <select
                value={line.vatRate}
                onChange={e => updateLine(idx, "vatRate", e.target.value)}
                className={INPUT_CLASS}
                disabled={isPending}
              >
                {VAT_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>

            <div>
              {idx === 0 && <p className="text-xs text-muted-foreground mb-1">Base imponible (€)</p>}
              <input
                type="number" step="0.01" placeholder="0.00"
                value={centsToDisplay(line.baseAmountInCents)}
                onChange={e => updateLine(idx, "baseAmountInCents", e.target.value)}
                className={INPUT_CLASS}
                disabled={isPending}
              />
            </div>

            <div>
              {idx === 0 && <p className="text-xs text-muted-foreground mb-1">Cuota IVA (€)</p>}
              <input
                type="number" step="0.01" placeholder="0.00"
                value={centsToDisplay(line.taxInCents)}
                onChange={e => updateLine(idx, "taxInCents", e.target.value)}
                className={INPUT_CLASS}
                disabled={isPending}
              />
            </div>

            <button
              type="button"
              onClick={() => removeLine(idx)}
              className="text-muted-foreground hover:text-destructive text-lg leading-none pb-1"
              title="Eliminar línea"
            >
              ×
            </button>
          </div>
        ))}

        {vatLines.length > 0 && (
          <div className="text-xs text-muted-foreground border-t pt-2 flex gap-6">
            <span>Base total: <strong>{centsToDisplay(derivedBase)} €</strong></span>
            <span>IVA total: <strong>{centsToDisplay(derivedTax)} €</strong></span>
            <span>Total: <strong>{centsToDisplay(derivedTotal)} €</strong></span>
          </div>
        )}
      </div>

      {/* Adjunto info + OCR flag */}
      {ocrFile && (
        <p className="text-xs text-muted-foreground">
          📎 Se adjuntará: <span className="font-medium">{ocrFile.name}</span>
        </p>
      )}
      {extracted && <input type="hidden" name="ocrExtracted" value="true" />}

      <button
        type="submit" disabled={isPending}
        className="rounded-md bg-primary px-5 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {isPending ? "Guardando…" : "Registrar factura"}
      </button>
    </form>
  );
}
