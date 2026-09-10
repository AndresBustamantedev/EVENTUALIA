"use client";

/**
 * Panel de importación masiva de facturas PDF digitales.
 * Procesa los archivos uno a uno mostrando progreso, luego muestra
 * una tabla de revisión con proveedor auto-detectado.
 */
import React, { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  extractAndStoreInvoiceAction,
  saveBulkInvoicesAction,
  type SingleExtractResult,
  type ExtractionMode,
  type VatLineExtracted,
} from "@/modules/suppliers/actions/bulkImport";
import { quickCreateSupplierAction } from "@/modules/suppliers/actions/suppliers";
import type { SupplierRow } from "@/modules/suppliers/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReviewRow {
  fileName:             string;
  storedFileId:         string;
  include:              boolean;
  numInput:             string;
  dateInput:            string;
  totalEuros:           string;
  taxEuros:             string;
  baseEuros:            string;
  vatRateInput:         string;
  vatLines:             VatLineExtracted[];   // desglose multi-IVA si lo hay
  detectedSupplierName: string | null;
  detectedSupplierCif:  string | null;
  resolvedSupplierId:   string;   // siempre necesita valor para guardar
  extractionError:      string | null;
}

interface Props {
  suppliers: SupplierRow[];
  /** ID del proveedor especial "Sin asignar" (isActive:false) */
  unassignedSupplierId: string;
}

type Stage = "idle" | "processing" | "review" | "saving" | "done";

// ── Helpers ───────────────────────────────────────────────────────────────────

function eurosToCents(s: string): number {
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

function centsToEuros(c: number | null | undefined): string {
  if (c == null || c === 0) return "";
  return (c / 100).toFixed(2);
}

function matchSupplier(name: string | null, cif: string | null, suppliers: SupplierRow[]): string {
  if (cif && cif.length >= 7) {
    const norm = cif.replace(/[-\s]/g, "").toUpperCase();
    const found = suppliers.find(s => s.taxId?.replace(/[-\s]/g, "").toUpperCase() === norm);
    if (found) return found.id;
  }
  if (name && name.length > 3) {
    const n = name.toLowerCase();
    const found = suppliers.find(s => {
      const sn = s.name.toLowerCase();
      return sn.includes(n) || n.includes(sn);
    });
    if (found) return found.id;
  }
  return "";
}

const MODE_LABELS: Record<ExtractionMode, string> = {
  ai:     "Analizando con IA…",
  local:  "Extrayendo texto del PDF…",
  manual: "Subiendo archivos…",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function BulkImportPanel({ suppliers, unassignedSupplierId }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [extractionMode, setExtractionMode] = useState<ExtractionMode>("ai");

  // Proveedores activos (excluye "Sin asignar") + los creados al vuelo en esta sesión
  const activeSuppliers = suppliers.filter(s => s.id !== unassignedSupplierId);
  const [localSuppliers, setLocalSuppliers] = useState<SupplierRow[]>([]);
  // Deduplicate: excluir de localSuppliers los que ya llegaron en el prop (tras revalidación)
  const activeIds = new Set(activeSuppliers.map(s => s.id));
  const dedupedLocal = localSuppliers.filter(s => !activeIds.has(s.id));

  // Inline create form
  const [creatingForRow, setCreatingForRow] = useState<number | null>(null);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, startCreating] = useTransition();

  // ── File selection ──────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []).filter(f => f.type === "application/pdf");
    setFiles(selected);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type === "application/pdf");
    setFiles(dropped);
  }

  // ── Processing ──────────────────────────────────────────────────────────────

  async function handleProcess(mode: ExtractionMode = "ai") {
    if (!files.length) return;
    setGlobalError(null);
    setExtractionMode(mode);
    setStage("processing");
    setProgress({ done: 0, total: files.length });

    const results: ReviewRow[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);

      let result: SingleExtractResult;
      try {
        result = await extractAndStoreInvoiceAction(fd);
      } catch (e: unknown) {
        result = { error: `Error inesperado: ${e instanceof Error ? e.message : String(e)}` };
      }

      if (result.error && !result.storedFileId) {
        results.push({
          fileName:             file.name,
          storedFileId:         "",
          include:              false,
          numInput:             "",
          dateInput:            new Date().toISOString().split("T")[0],
          totalEuros:           "",
          taxEuros:             "",
          baseEuros:            "",
          vatRateInput:         "",
          vatLines:             [],
          detectedSupplierName: null,
          detectedSupplierCif:  null,
          resolvedSupplierId:   "",
          extractionError:      result.error,
        });
      } else {
        const allKnown = [...activeSuppliers, ...dedupedLocal];
      const matched = matchSupplier(result.supplierName ?? null, result.supplierCif ?? null, allKnown);
        const vatLines = result.vatLines ?? [];
        const isMultiVat = vatLines.length > 1;
        const aggBase = isMultiVat
          ? vatLines.reduce((s, v) => s + v.baseAmountInCents, 0)
          : (result.baseAmountInCents ?? null);
        const aggTax = isMultiVat
          ? vatLines.reduce((s, v) => s + v.taxInCents, 0)
          : (result.taxInCents ?? null);
        results.push({
          fileName:             file.name,
          storedFileId:         result.storedFileId ?? "",
          include:              !result.error,
          numInput:             result.invoiceNumber ?? "",
          dateInput:            result.invoiceDate   ?? new Date().toISOString().split("T")[0],
          totalEuros:           centsToEuros(result.totalInCents),
          taxEuros:             centsToEuros(aggTax),
          baseEuros:            centsToEuros(aggBase),
          vatRateInput:         isMultiVat ? "" : (result.vatRate != null ? String(result.vatRate) : ""),
          vatLines:             vatLines,
          detectedSupplierName: result.supplierName ?? null,
          detectedSupplierCif:  result.supplierCif  ?? null,
          resolvedSupplierId:   matched,
          extractionError:      result.error ?? null,
        });
      }

      setProgress({ done: i + 1, total: files.length });
    }

    setRows(results);
    setStage("review");
  }

  // ── Row updates ─────────────────────────────────────────────────────────────

  function updateRow(i: number, patch: Partial<ReviewRow>) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  // ── Quick create supplier ──────────────────────────────────────────────────

  function openCreate(rowIdx: number, detectedName: string | null) {
    setCreatingForRow(rowIdx);
    setCreateName(detectedName?.trim() ?? "");
    setCreateError(null);
  }

  function handleQuickCreate(rowIdx: number) {
    setCreateError(null);
    startCreating(async () => {
      const res = await quickCreateSupplierAction(createName);
      if (res.error) {
        setCreateError(res.error);
        return;
      }
      // Add to local list and assign to this row
      const newSupplier: SupplierRow = {
        id: res.id!,
        name: createName.trim(),
        taxId: null,
        contactName: null,
        email: null,
        phone: null,
        address: null,
        website: null,
        notes: null,
        isActive: true,
        branch: "BOTH",
        tags: [],
        createdAt: new Date().toISOString(),
      };
      setLocalSuppliers(prev => [...prev, newSupplier]);
      updateRow(rowIdx, { resolvedSupplierId: res.id! });
      setCreatingForRow(null);
      setCreateName("");
    });
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    const toSave = rows
      .filter(r => r.include && r.storedFileId)
      .map(r => ({
        supplierId:        r.resolvedSupplierId,
        storedFileId:      r.storedFileId,
        invoiceNumber:     r.numInput.trim() || null,
        invoiceDate:       r.dateInput || new Date().toISOString().split("T")[0],
        totalInCents:      eurosToCents(r.totalEuros),
        taxInCents:        r.taxEuros  ? eurosToCents(r.taxEuros)  : null,
        baseAmountInCents: r.baseEuros ? eurosToCents(r.baseEuros) : null,
        vatRate:           r.vatRateInput ? parseFloat(r.vatRateInput) : null,
        vatLines:          r.vatLines,
      }));

    const missing = toSave.filter(r => !r.supplierId);
    if (missing.length) {
      setGlobalError(`${missing.length} factura${missing.length > 1 ? "s" : ""} sin proveedor asignado.`);
      return;
    }
    const noAmount = toSave.filter(r => r.totalInCents === 0);
    if (noAmount.length) {
      setGlobalError(`${noAmount.length} factura${noAmount.length > 1 ? "s" : ""} con importe en 0. Revísalas antes de guardar.`);
      return;
    }
    if (!toSave.length) {
      setGlobalError("Selecciona al menos una factura.");
      return;
    }

    setGlobalError(null);
    setStage("saving");
    const result = await saveBulkInvoicesAction(toSave);
    if (result.error) {
      setGlobalError(result.error);
      setStage("review");
      return;
    }
    setSavedCount(result.count ?? toSave.length);
    setStage("done");
    router.refresh();
  }

  const selected      = rows.filter(r => r.include).length;
  const needsSupplier = rows.filter(r => r.include && !r.resolvedSupplierId).length;

  // ── Done ────────────────────────────────────────────────────────────────────

  if (stage === "done") {
    return (
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 px-6 py-8 text-center space-y-3">
        <p className="text-2xl">✓</p>
        <p className="font-semibold text-emerald-700 dark:text-emerald-400">
          {savedCount} factura{savedCount !== 1 ? "s" : ""} importada{savedCount !== 1 ? "s" : ""} correctamente
        </p>
        <button
          onClick={() => { setStage("idle"); setFiles([]); setRows([]); }}
          className="text-sm text-primary hover:underline"
        >
          Importar más archivos
        </button>
      </div>
    );
  }

  // ── Main ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Drop zone ── */}
      {stage === "idle" && (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`rounded-xl border-2 border-dashed px-6 py-12 text-center cursor-pointer transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/30"
          }`}
        >
          <p className="text-3xl mb-3">📄</p>
          <p className="font-medium text-sm">Arrastra tus PDFs aquí o haz clic para seleccionarlos</p>
          <p className="text-xs text-muted-foreground mt-1">Solo archivos PDF · Hasta 50 archivos a la vez</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {/* ── File list preview ── */}
      {stage === "idle" && files.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">{files.length} archivo{files.length !== 1 ? "s" : ""} seleccionado{files.length !== 1 ? "s" : ""}</p>
          <div className="rounded-lg border divide-y max-h-40 overflow-y-auto text-xs">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2">
                <span className="text-muted-foreground">📄</span>
                <span className="truncate flex-1">{f.name}</span>
                <span className="text-muted-foreground shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
              </div>
            ))}
          </div>

          {/* Mode buttons */}
          <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Método de extracción</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleProcess("ai")}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                ✦ Procesar con IA
              </button>
              <button
                onClick={() => handleProcess("local")}
                className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted/50"
              >
                📊 Extraer texto (sin IA)
              </button>
              <button
                onClick={() => handleProcess("manual")}
                className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50"
              >
                ✎ Solo subir
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground/70">
              <strong>IA:</strong> más preciso, llama a Claude API. &nbsp;
              <strong>Sin IA:</strong> gratuito, lee el texto del PDF directamente. &nbsp;
              <strong>Solo subir:</strong> almacena sin extraer nada.
            </p>
          </div>

          <button
            onClick={() => { setFiles([]); if (fileInputRef.current) fileInputRef.current.value = ""; }}
            className="text-xs text-muted-foreground/50 hover:underline"
          >
            Limpiar selección
          </button>
        </div>
      )}

      {/* ── Processing progress ── */}
      {stage === "processing" && (
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="animate-pulse text-muted-foreground">{MODE_LABELS[extractionMode]}</span>
            <span className="font-medium tabular-nums">{progress.done} / {progress.total}</span>
          </div>
          <div className="w-full rounded-full bg-muted h-2 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Esto puede tardar unos segundos por archivo. No cierres la página.
          </p>
        </div>
      )}

      {/* ── Review table ── */}
      {(stage === "review" || stage === "saving") && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {rows.length} archivo{rows.length !== 1 ? "s" : ""} procesado{rows.length !== 1 ? "s" : ""} — revisa y confirma
            </p>
            <button
              onClick={() => { setStage("idle"); setFiles([]); setRows([]); setGlobalError(null); }}
              className="text-xs text-muted-foreground hover:underline"
            >
              Volver a seleccionar
            </button>
          </div>

          {globalError && (
            <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              {globalError}
            </p>
          )}

          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-2 py-2.5 w-7">
                      <input
                        type="checkbox"
                        checked={rows.every(r => r.include || !!r.extractionError)}
                        onChange={e => setRows(prev => prev.map(r => r.extractionError ? r : { ...r, include: e.target.checked }))}
                        className="rounded"
                      />
                    </th>
                    <th className="px-2 py-2.5 font-medium">Archivo</th>
                    <th className="px-2 py-2.5 font-medium min-w-[140px]">Proveedor</th>
                    <th className="px-2 py-2.5 font-medium">Nº Factura</th>
                    <th className="px-2 py-2.5 font-medium">Fecha</th>
                    <th className="px-2 py-2.5 font-medium text-right">Base (€)</th>
                    <th className="px-2 py-2.5 font-medium text-right">IVA %</th>
                    <th className="px-2 py-2.5 font-medium text-right">Cuota IVA (€)</th>
                    <th className="px-2 py-2.5 font-medium text-right">Total (€)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row, i) => (
                    <tr key={i} className={`${!row.include ? "opacity-40" : ""} ${row.extractionError ? "bg-red-50/40 dark:bg-red-900/10" : ""}`}>
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={row.include}
                          disabled={!!row.extractionError && !row.storedFileId}
                          onChange={e => updateRow(i, { include: e.target.checked })}
                          className="rounded"
                        />
                      </td>
                      <td className="px-2 py-1.5 max-w-[140px]">
                        <span className="truncate block text-muted-foreground" title={row.fileName}>{row.fileName}</span>
                        {row.extractionError && (
                          <span className="text-[10px] text-destructive">⚠ {row.extractionError}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 min-w-[180px]">
                        {creatingForRow === i ? (
                          /* ── Inline create form ── */
                          <div className="space-y-1">
                            <input
                              autoFocus
                              type="text"
                              value={createName}
                              onChange={e => setCreateName(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleQuickCreate(i); } if (e.key === "Escape") setCreatingForRow(null); }}
                              placeholder="Nombre del proveedor"
                              className="w-full rounded border border-primary bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            {createError && <p className="text-[10px] text-destructive">{createError}</p>}
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => handleQuickCreate(i)}
                                disabled={isCreating || !createName.trim()}
                                className="rounded bg-primary px-2 py-0.5 text-[10px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                              >
                                {isCreating ? "…" : "Crear"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setCreatingForRow(null)}
                                className="rounded border border-input px-2 py-0.5 text-[10px] hover:bg-muted"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ── Dropdown normal ── */
                          <div className="flex items-center gap-1">
                            <select
                              value={row.resolvedSupplierId}
                              onChange={e => updateRow(i, { resolvedSupplierId: e.target.value })}
                              className={`flex-1 rounded border bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring ${
                                !row.resolvedSupplierId
                                  ? "border-destructive text-destructive"
                                  : "border-input"
                              }`}
                            >
                              <option value="">— Selecciona —</option>
                              <option value={unassignedSupplierId}>🗂 Sin asignar (clasificar después)</option>
                              {[...activeSuppliers, ...dedupedLocal].map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                            {/* + button: only when no supplier selected */}
                            {!row.resolvedSupplierId && (
                              <button
                                type="button"
                                title="Crear proveedor nuevo"
                                onClick={() => openCreate(i, row.detectedSupplierName)}
                                className="shrink-0 rounded border border-input bg-background px-1.5 py-1 text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                              >
                                +
                              </button>
                            )}
                          </div>
                        )}
                        {row.detectedSupplierName && creatingForRow !== i && (
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate" title={row.detectedSupplierName}>
                            {row.detectedSupplierName}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={row.numInput}
                          onChange={e => updateRow(i, { numInput: e.target.value })}
                          placeholder="Sin nº"
                          className="w-full rounded border border-input bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="date"
                          value={row.dateInput}
                          onChange={e => updateRow(i, { dateInput: e.target.value })}
                          className="rounded border border-input bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={row.baseEuros}
                          onChange={e => updateRow(i, { baseEuros: e.target.value })}
                          placeholder="—"
                          className="w-20 rounded border border-input bg-background px-1.5 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {row.vatLines.length > 1 ? (
                          <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300 whitespace-nowrap" title={row.vatLines.map(v => `${v.vatRate}%: ${(v.baseAmountInCents/100).toFixed(2)}€`).join(' | ')}>
                            {row.vatLines.map(v => `${v.vatRate}%`).join('/')}
                          </span>
                        ) : (
                          <select
                            value={row.vatRateInput}
                            onChange={e => updateRow(i, { vatRateInput: e.target.value })}
                            className="rounded border border-input bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="">—</option>
                            <option value="21">21%</option>
                            <option value="10">10%</option>
                            <option value="4">4%</option>
                            <option value="0">0%</option>
                          </select>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={row.taxEuros}
                          onChange={e => updateRow(i, { taxEuros: e.target.value })}
                          placeholder="—"
                          className="w-20 rounded border border-input bg-background px-1.5 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={row.totalEuros}
                          onChange={e => updateRow(i, { totalEuros: e.target.value })}
                          placeholder="0.00"
                          className={`w-24 rounded border bg-background px-1.5 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring ${
                            !row.totalEuros ? "border-amber-400" : "border-input"
                          }`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground space-x-3">
              <span>{selected} seleccionada{selected !== 1 ? "s" : ""}</span>
              {needsSupplier > 0 && (
                <span className="text-destructive font-medium">· {needsSupplier} sin proveedor</span>
              )}
              {rows.some(r => r.include && !r.totalEuros) && (
                <span className="text-amber-600">· revisa importes en 0</span>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={stage === "saving" || selected === 0}
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {stage === "saving" ? "Guardando…" : `Guardar ${selected} factura${selected !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
