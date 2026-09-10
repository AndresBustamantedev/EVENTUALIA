"use client";

/**
 * Pestaña Tarifas del proveedor.
 * Tres secciones:
 *  1. Extracción IA desde PDF/revista de precios
 *  2. Exportar / Importar CSV de la tarifa actual
 *  3. Tabla de precios actuales con fecha de última actualización
 */
import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  extractPriceListAction,
  savePriceListAction,
  exportPriceListCsvAction,
  importPriceListCsvAction,
  type ExtractedPriceItem,
  type SavePriceLineInput,
} from "@/modules/suppliers/actions/priceList";
import type { SupplierProductRow } from "@/modules/suppliers/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function euros(cents: number | null): string {
  if (!cents) return "—";
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function centsToEuros(cents: number | null): string {
  if (!cents) return "";
  return (cents / 100).toFixed(2);
}

function eurosToCents(str: string): number {
  const n = parseFloat(str.replace(",", "."));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.split("T")[0];
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface EditableItem extends ExtractedPriceItem {
  include:      boolean;
  nameInput:    string;
  presInput:    string;
  qtyInput:     string;
  priceInput:   string;
  refInput:     string;
}

interface Props {
  supplierId:    string;
  supplierName:  string;
  currentPrices: SupplierProductRow[];
  canWrite:      boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TarifasTab({ supplierId, supplierName, currentPrices, canWrite }: Props) {
  const router = useRouter();

  // ── AI extraction state ───────────────────────────────────────────────────
  const [aiStage, setAiStage]   = useState<"idle"|"extracting"|"review"|"saving"|"done">("idle");
  const [aiError, setAiError]   = useState<string | null>(null);
  const [aiItems, setAiItems]   = useState<EditableItem[]>([]);
  const [aiSaved, setAiSaved]   = useState<{created:number;updated:number} | null>(null);
  const [aiPending, startAi]    = useTransition();
  const aiFileRef               = useRef<HTMLInputElement>(null);

  // ── CSV state ─────────────────────────────────────────────────────────────
  const [csvError,   setCsvError]   = useState<string | null>(null);
  const [csvSuccess, setCsvSuccess] = useState<string | null>(null);
  const [csvPending, startCsv]      = useTransition();
  const csvFileRef                  = useRef<HTMLInputElement>(null);

  // ── AI: extract ───────────────────────────────────────────────────────────

  function handleAiExtract() {
    const file = aiFileRef.current?.files?.[0];
    if (!file) { setAiError("Selecciona un archivo primero."); return; }
    setAiError(null);
    startAi(async () => {
      setAiStage("extracting");
      const fd = new FormData();
      fd.append("file", file);
      const result = await extractPriceListAction(supplierId, fd);
      if (result.error || !result.items?.length) {
        setAiError(result.error ?? "No se detectaron productos.");
        setAiStage("idle");
        return;
      }
      setAiItems(result.items.map(item => ({
        ...item,
        include:    true,
        nameInput:  item.productName,
        presInput:  item.presentation,
        qtyInput:   String(item.quantity),
        priceInput: centsToEuros(item.priceInCents),
        refInput:   item.reference ?? "",
      })));
      setAiStage("review");
    });
  }

  function updateItem(i: number, patch: Partial<EditableItem>) {
    setAiItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  }

  function handleAiSave() {
    const toSave: SavePriceLineInput[] = aiItems
      .filter(it => it.include && it.nameInput.trim() && eurosToCents(it.priceInput) > 0)
      .map(it => ({
        productName:               it.nameInput.trim(),
        presentation:              it.presInput.trim() || "unidad",
        quantity:                  parseFloat(it.qtyInput) || 1,
        unit:                      it.unit,
        priceInCents:              eurosToCents(it.priceInput),
        reference:                 it.refInput.trim() || null,
        category:                  it.category,
        existingProductId:         it.existingProductId,
        existingSupplierProductId: it.existingSupplierProductId,
      }));

    if (!toSave.length) { setAiError("Selecciona al menos un producto con precio válido."); return; }
    setAiError(null);
    setAiStage("saving");
    startAi(async () => {
      const result = await savePriceListAction(supplierId, toSave);
      if (result.error) { setAiError(result.error); setAiStage("review"); return; }
      setAiSaved({ created: result.created ?? 0, updated: result.updated ?? 0 });
      setAiStage("done");
      router.refresh();
    });
  }

  // ── CSV: export ───────────────────────────────────────────────────────────

  function handleCsvExport() {
    setCsvError(null); setCsvSuccess(null);
    startCsv(async () => {
      const result = await exportPriceListCsvAction(supplierId);
      if (result.error || !result.csv) { setCsvError(result.error ?? "Error al exportar."); return; }
      // Trigger browser download
      const blob = new Blob(["﻿" + result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tarifa-${supplierName.replace(/\s+/g,"-").toLowerCase()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setCsvSuccess("CSV descargado correctamente.");
    });
  }

  function handleCsvImport() {
    const file = csvFileRef.current?.files?.[0];
    if (!file) { setCsvError("Selecciona un archivo CSV primero."); return; }
    setCsvError(null); setCsvSuccess(null);
    startCsv(async () => {
      const text = await file.text();
      const result = await importPriceListCsvAction(supplierId, text);
      if (result.error) { setCsvError(result.error); return; }
      const msg = `Importado: ${result.created} creados, ${result.updated} actualizados${result.skipped ? `, ${result.skipped} omitidos` : ""}.`;
      setCsvSuccess(msg);
      if (csvFileRef.current) csvFileRef.current.value = "";
      router.refresh();
    });
  }

  const selectedCount = aiItems.filter(it => it.include).length;

  return (
    <div className="space-y-8">

      {/* ── 1. Extracción IA ─────────────────────────────────────────────── */}
      {canWrite && (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">✦ Subir tarifa con IA</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sube el PDF o foto de la tarifa del proveedor y la IA extraerá los productos y precios automáticamente.
            </p>
          </div>

          {aiStage === "idle" || aiStage === "extracting" ? (
            <div className="flex items-center gap-3 flex-wrap">
              <input
                ref={aiFileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:cursor-pointer hover:file:bg-muted/80"
              />
              <button
                type="button"
                onClick={handleAiExtract}
                disabled={aiPending || aiStage === "extracting"}
                className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {aiStage === "extracting" ? "Analizando… (10–60 s)" : "Extraer con IA"}
              </button>
              {aiError && <p className="text-xs text-destructive w-full">{aiError}</p>}
            </div>
          ) : aiStage === "done" ? (
            <div className="flex items-center gap-4">
              <p className="text-sm text-emerald-600 font-medium">
                ✓ {aiSaved?.created} producto{aiSaved?.created !== 1 ? "s" : ""} creados
                · {aiSaved?.updated} actualizados
              </p>
              <button
                type="button"
                onClick={() => { setAiStage("idle"); setAiSaved(null); if (aiFileRef.current) aiFileRef.current.value = ""; }}
                className="text-xs text-primary hover:underline"
              >
                Subir otra tarifa
              </button>
            </div>
          ) : (
            /* Review / Saving stage */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">
                  {aiItems.length} producto{aiItems.length !== 1 ? "s" : ""} detectado{aiItems.length !== 1 ? "s" : ""} — revisa y confirma
                </p>
                <button
                  type="button"
                  onClick={() => { setAiStage("idle"); setAiError(null); if (aiFileRef.current) aiFileRef.current.value = ""; }}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  Cancelar
                </button>
              </div>

              {aiError && <p className="text-xs text-destructive">{aiError}</p>}

              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-xs min-w-[700px]">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-2 py-2 w-7">
                        <input type="checkbox"
                          checked={aiItems.every(it => it.include)}
                          onChange={e => setAiItems(prev => prev.map(it => ({ ...it, include: e.target.checked })))}
                          className="rounded" />
                      </th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground">Producto</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground">Presentación</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground w-16">Cant.</th>
                      <th className="px-2 py-2 text-right font-medium text-muted-foreground w-24">Precio (€)</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground">Ref.</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground w-24">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {aiItems.map((item, i) => (
                      <tr key={i} className={!item.include ? "opacity-40" : ""}>
                        <td className="px-2 py-1.5">
                          <input type="checkbox" checked={item.include}
                            onChange={e => updateItem(i, { include: e.target.checked })}
                            className="rounded" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="text" value={item.nameInput}
                            onChange={e => updateItem(i, { nameInput: e.target.value })}
                            className="w-full min-w-[120px] rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="text" value={item.presInput}
                            onChange={e => updateItem(i, { presInput: e.target.value })}
                            className="w-full min-w-[100px] rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" value={item.qtyInput} min="0" step="any"
                            onChange={e => updateItem(i, { qtyInput: e.target.value })}
                            className="w-16 rounded border border-input bg-background px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring" />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input type="number" value={item.priceInput} min="0" step="0.01"
                            onChange={e => updateItem(i, { priceInput: e.target.value })}
                            className={`w-24 rounded border bg-background px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring ${!item.priceInput ? "border-amber-400" : "border-input"}`} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="text" value={item.refInput}
                            onChange={e => updateItem(i, { refInput: e.target.value })}
                            className="w-full min-w-[80px] rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
                        </td>
                        <td className="px-2 py-1.5">
                          {item.isExactMatch ? (
                            item.existingSupplierProductId ? (
                              <span className="text-blue-600 font-medium">↑ Actualizar</span>
                            ) : (
                              <span className="text-emerald-600">✅ Nuevo precio</span>
                            )
                          ) : (
                            <span className="text-amber-600">🆕 Crear</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {selectedCount} seleccionado{selectedCount !== 1 ? "s" : ""}
                  {aiItems.some(it => it.include && !it.priceInput) && (
                    <span className="ml-2 text-amber-600">· revisa precios vacíos</span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={handleAiSave}
                  disabled={aiStage === "saving" || selectedCount === 0}
                  className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {aiStage === "saving" ? "Guardando…" : `Guardar ${selectedCount} producto${selectedCount !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── 2. CSV Export / Import ───────────────────────────────────────── */}
      <section className="space-y-3 border-t pt-6">
        <div>
          <h2 className="text-base font-semibold">📊 Exportar / Importar CSV</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Descarga la tarifa actual en Excel/CSV, edítala y vuelve a subirla para actualizar precios en bloque.
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-4">
          {/* Export */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Exportar</p>
            <button
              type="button"
              onClick={handleCsvExport}
              disabled={csvPending}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              ⬇ Descargar CSV
            </button>
          </div>

          {/* Import */}
          {canWrite && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Importar</p>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={csvFileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="text-xs file:mr-2 file:rounded file:border file:border-border file:bg-muted file:px-2 file:py-1 file:text-xs file:cursor-pointer hover:file:bg-muted/80"
                />
                <button
                  type="button"
                  onClick={handleCsvImport}
                  disabled={csvPending}
                  className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {csvPending ? "Importando…" : "⬆ Importar CSV"}
                </button>
              </div>
            </div>
          )}
        </div>

        {csvError   && <p className="text-xs text-destructive">{csvError}</p>}
        {csvSuccess && <p className="text-xs text-emerald-600 font-medium">{csvSuccess}</p>}

        <p className="text-xs text-muted-foreground">
          Formato: <code className="bg-muted px-1 rounded">id, producto, presentacion, cantidad, unidad, precio_euros, referencia, activo, precio_actualizado</code>.
          La columna <code className="bg-muted px-1 rounded">id</code> permite actualizar filas existentes sin perder el historial.
        </p>
      </section>

      {/* ── 3. Tabla de precios actuales ─────────────────────────────────── */}
      <section className="space-y-3 border-t pt-6">
        <h2 className="text-base font-semibold">
          Tarifa actual
          <span className="ml-2 text-sm font-normal text-muted-foreground">({currentPrices.length} productos)</span>
        </h2>

        {currentPrices.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">Sin precios registrados. Sube una tarifa con IA o importa un CSV.</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-xs text-muted-foreground uppercase tracking-wide">Producto</th>
                  <th className="px-4 py-3 text-left font-medium text-xs text-muted-foreground uppercase tracking-wide">Presentación</th>
                  <th className="px-4 py-3 text-right font-medium text-xs text-muted-foreground uppercase tracking-wide">Precio</th>
                  <th className="px-4 py-3 text-right font-medium text-xs text-muted-foreground uppercase tracking-wide">€ / ud</th>
                  <th className="px-4 py-3 text-left font-medium text-xs text-muted-foreground uppercase tracking-wide">Ref.</th>
                  <th className="px-4 py-3 text-left font-medium text-xs text-muted-foreground uppercase tracking-wide">Actualizado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {currentPrices.map(sp => (
                  <tr key={sp.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium">{sp.productName}</p>
                      {sp.productUnit && <p className="text-xs text-muted-foreground">ud: {sp.productUnit}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{sp.presentation} ({sp.quantity} ud)</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{euros(sp.priceInCents)}</td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">{euros(sp.pricePerUnit)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{sp.reference ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      {sp.priceUpdatedAt ? (
                        <span className="text-foreground">{fmtDate(sp.priceUpdatedAt)}</span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
