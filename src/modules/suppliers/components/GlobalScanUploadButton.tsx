"use client";

/**
 * Botón de subida de escáner global — sin proveedor previo.
 * Permite subir un PDF con varias facturas de distintos proveedores,
 * asignar cada una al proveedor correcto y guardarlas de una vez.
 * El bundle se guarda bajo el proveedor mayoritario.
 *
 * Props:
 *   suppliers  — lista de proveedores (cargada en servidor)
 *   onClose    — cuando se proporciona, el componente se muestra siempre
 *                como panel (sin botón trigger interno). El padre controla
 *                la visibilidad montando/desmontando el componente.
 */

import React, { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  uploadGlobalScanAction,
  saveGlobalScansAction,
  type ExtractedBundleLine,
  type VatLineExtracted,
} from "@/modules/suppliers/actions/bundles";
import { listProducts } from "@/modules/suppliers/actions/products";
import { listSuppliers } from "@/modules/suppliers/actions/suppliers";
import type { ProductRow, SupplierRow } from "@/modules/suppliers/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EditableLineItem {
  rawDescription:   string;
  quantity:         number | null;
  unitPriceInCents: number | null;
  totalInCents:     number | null;
  productId:        string | null;
  newProductName:   string;
  isNewProduct:     boolean;
}

interface EditableInvoice {
  include:              boolean;
  numInput:             string;
  dateInput:            string;
  amountEuros:          string;
  lineItems:            EditableLineItem[];
  showItems:            boolean;
  detectedSupplierName: string | null;
  detectedSupplierCif:  string | null;
  resolvedSupplierId:   string | null;
  vatLines:             VatLineExtracted[];
}

type Stage = "idle" | "uploading" | "review" | "saving" | "done";

interface Props {
  /** Pre-loaded list of suppliers (from server, passed in) */
  suppliers: SupplierRow[];
  /**
   * When provided the component always renders as an expanded panel —
   * the trigger button is suppressed. Call this to tell the parent
   * to unmount the component (close the panel).
   */
  onClose?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function centsToEuros(cents: number | null): string {
  if (cents === null || cents === 0) return "";
  return (cents / 100).toFixed(2);
}

function eurosToCents(str: string): number {
  const n = parseFloat(str.replace(",", "."));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

function fmtEuros(cents: number | null): string {
  if (!cents) return "—";
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function matchProduct(description: string, products: ProductRow[]): string | null {
  const desc = description.toLowerCase();
  const found = products.find(
    p => desc.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(desc.substring(0, 10))
  );
  return found?.id ?? null;
}

function matchSupplier(name: string | null, cif: string | null, suppliers: SupplierRow[]): string | null {
  if (!suppliers.length) return null;
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
  return null;
}

function emptyInvoice(): EditableInvoice {
  return {
    include:              true,
    numInput:             "",
    dateInput:            new Date().toISOString().split("T")[0],
    amountEuros:          "",
    showItems:            false,
    lineItems:            [],
    detectedSupplierName: null,
    detectedSupplierCif:  null,
    resolvedSupplierId:   null,
    vatLines:             [],
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GlobalScanUploadButton({ suppliers, onClose }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  // When onClose is provided (controlled mode), start with the panel open
  const [showPanel, setShowPanel]       = useState(onClose !== undefined);
  const [stage, setStage]               = useState<Stage>("idle");
  const [error, setError]               = useState<string | null>(null);
  const [invoices, setInvoices]         = useState<EditableInvoice[]>([]);
  const [storedFileId, setStoredFileId] = useState<string | null>(null);
  const [bundleDate, setBundleDate]     = useState(new Date().toISOString().split("T")[0]);
  const [savedCount, setSavedCount]     = useState(0);
  const [createOrder, setCreateOrder]   = useState(false);
  const [products, setProducts]         = useState<ProductRow[]>([]);
  const [isPending, startTransition]    = useTransition();

  function handleOpenPanel() {
    setShowPanel(true);
    setStage("idle");
    setError(null);
    setInvoices([]);
    setStoredFileId(null);
  }

  function handleClose() {
    setShowPanel(false);
    setStage("idle");
    setError(null);
    setInvoices([]);
    setStoredFileId(null);
    if (fileRef.current) fileRef.current.value = "";
    onClose?.();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    setStage("uploading");
    startTransition(async () => {
      const [result, prods] = await Promise.all([
        uploadGlobalScanAction(formData),
        listProducts(false).catch(() => [] as ProductRow[]),
      ]);
      setProducts(prods);

      if (result.error) {
        setError(result.error);
        setStage("idle");
        return;
      }

      const raw = result.lines ?? [];
      if (raw.length === 0) {
        setError("La IA no detectó facturas en este PDF. Intenta con un escáner de mejor calidad o añade las facturas manualmente.");
        setStage("idle");
        return;
      }

      setStoredFileId(result.storedFileId ?? null);
      const today = new Date().toISOString().split("T")[0];

      setInvoices(raw.map((l: ExtractedBundleLine) => {
        const detectedName = l.supplierName ?? null;
        const detectedCif  = l.supplierCif  ?? null;
        const matchedId    = matchSupplier(detectedName, detectedCif, suppliers);
        return {
          include:              true,
          numInput:             l.invoiceNumber ?? "",
          dateInput:            l.invoiceDate   ?? today,
          amountEuros:          centsToEuros(l.amountInCents),
          showItems:            false,
          detectedSupplierName: detectedName,
          detectedSupplierCif:  detectedCif,
          resolvedSupplierId:   matchedId,
          vatLines:             l.vatLines ?? [],
          lineItems: (l.lineItems ?? []).map(li => {
            const matched = matchProduct(li.rawDescription, prods);
            return {
              rawDescription:   li.rawDescription,
              quantity:         li.quantity,
              unitPriceInCents: li.unitPriceInCents,
              totalInCents:     li.totalInCents,
              productId:        matched,
              newProductName:   li.rawDescription.slice(0, 100),
              isNewProduct:     !matched,
            };
          }),
        };
      }));
      setStage("review");
    });
  }

  function updateInvoice(i: number, patch: Partial<EditableInvoice>) {
    setInvoices(prev => prev.map((inv, idx) => idx === i ? { ...inv, ...patch } : inv));
  }

  function updateLineItem(invIdx: number, liIdx: number, patch: Partial<EditableLineItem>) {
    setInvoices(prev => prev.map((inv, idx) => {
      if (idx !== invIdx) return inv;
      return { ...inv, lineItems: inv.lineItems.map((li, lidx) => lidx === liIdx ? { ...li, ...patch } : li) };
    }));
  }

  function handleSave() {
    if (!storedFileId) { setError("No se encontró el archivo subido."); return; }

    const toSave = invoices
      .filter(inv => inv.include)
      .map(inv => ({
        invoiceNumber:     inv.numInput.trim() || null,
        amountInCents:     eurosToCents(inv.amountEuros),
        invoiceDate:       inv.dateInput || new Date().toISOString().split("T")[0],
        taxInCents:        null as number | null,
        baseAmountInCents: null as number | null,
        vatRate:           null as number | null,
        vatLines:          inv.vatLines,
        supplierId:        inv.resolvedSupplierId ?? undefined,
        lineItems:         inv.lineItems.map(li => ({
          rawDescription:   li.rawDescription,
          quantity:         li.quantity,
          unitPriceInCents: li.unitPriceInCents,
          totalInCents:     li.totalInCents,
          productId:        li.isNewProduct ? null : (li.productId ?? null),
          newProductName:   li.isNewProduct ? (li.newProductName.trim() || null) : null,
        })),
      }))
      .filter(inv => inv.amountInCents !== 0 && inv.invoiceDate);

    if (!toSave.length) {
      setError("Selecciona al menos una factura con importe válido.");
      return;
    }

    const withoutSupplier = toSave.filter(inv => !inv.supplierId).length;
    if (withoutSupplier === toSave.length) {
      setError("Asigna al menos una factura a un proveedor.");
      return;
    }

    setError(null);
    setStage("saving");
    startTransition(async () => {
      const result = await saveGlobalScansAction(storedFileId, bundleDate, toSave, createOrder);
      if (result.error) {
        setError(result.error);
        setStage("review");
        return;
      }
      setSavedCount(result.count ?? toSave.length);
      setStage("done");
      router.refresh();
    });
  }

  const selectedCount      = invoices.filter(inv => inv.include).length;
  const unassignedSelected = invoices.filter(inv => inv.include && !inv.resolvedSupplierId).length;

  // ── Done ──────────────────────────────────────────────────────────────────

  if (stage === "done") {
    return (
      <div className="rounded-xl border bg-card shadow-sm p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-emerald-600">
            ✓ {savedCount} factura{savedCount !== 1 ? "s" : ""} guardada{savedCount !== 1 ? "s" : ""} correctamente
          </p>
          <button
            type="button"
            onClick={handleClose}
            className="text-xs text-muted-foreground hover:underline"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  // ── Trigger button — only when not in controlled (onClose) mode ───────────

  if (!showPanel) {
    return (
      <button
        type="button"
        onClick={handleOpenPanel}
        className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
      >
        📷 Subir escáner con IA
      </button>
    );
  }

  // ── Panel ─────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border bg-card shadow-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Subir escáner de facturas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sube un PDF con varias facturas — la IA las extrae y tú asignas el proveedor de cada una.
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="text-muted-foreground hover:text-foreground text-lg leading-none shrink-0"
        >
          ✕
        </button>
      </div>

      {/* File picker + bundle date */}
      {(stage === "idle" || stage === "uploading") && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Fecha del escáner
              </label>
              <input
                type="date"
                value={bundleDate}
                onChange={e => setBundleDate(e.target.value)}
                disabled={stage === "uploading"}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Archivo PDF
              </label>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                disabled={stage === "uploading"}
                onChange={handleFileChange}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-0.5 file:text-xs file:font-medium cursor-pointer disabled:opacity-50"
              />
            </div>
          </div>

          {stage === "uploading" && (
            <p className="text-xs text-muted-foreground animate-pulse">
              Subiendo y analizando con IA… (puede tardar 15–30 segundos)
            </p>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            type="button"
            onClick={() => { setInvoices([emptyInvoice()]); setStage("review"); }}
            disabled={stage === "uploading"}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            ✎ Introducir manualmente sin subir PDF
          </button>
        </div>
      )}

      {/* Review table */}
      {(stage === "review" || stage === "saving") && (
        <div className="space-y-3">
          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">
              {invoices.length} factura{invoices.length !== 1 ? "s" : ""} detectada{invoices.length !== 1 ? "s" : ""} — asigna el proveedor de cada una
            </p>
            <button
              type="button"
              onClick={() => { setStage("idle"); setError(null); if (fileRef.current) fileRef.current.value = ""; }}
              className="text-xs text-muted-foreground hover:underline"
            >
              ← Volver
            </button>
          </div>

          {/* Bundle date (editable in review too) */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground shrink-0">Fecha del escáner:</label>
            <input
              type="date"
              value={bundleDate}
              onChange={e => setBundleDate(e.target.value)}
              className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Toggle: crear pedido */}
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none rounded-md border border-border/50 bg-muted/20 px-3 py-2">
            <input
              type="checkbox"
              checked={createOrder}
              onChange={e => setCreateOrder(e.target.checked)}
              className="rounded"
            />
            <span className="font-medium">📦 Registrar también como pedido y productos</span>
          </label>

          {/* Table */}
          <div className="rounded-md border border-border overflow-x-auto">
            <table className="w-full text-xs min-w-[680px]">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-2 py-2 text-left w-7">
                    <input
                      type="checkbox"
                      checked={invoices.every(inv => inv.include)}
                      onChange={e => setInvoices(prev => prev.map(inv => ({ ...inv, include: e.target.checked })))}
                      className="rounded"
                    />
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">Nº Factura</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">Fecha</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">Importe (€)</th>
                  <th className="px-2 py-2 text-center font-medium text-muted-foreground">IVA</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                    Proveedor <span className="text-destructive">*</span>
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">Artículos</th>
                  <th className="px-2 py-2 w-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((inv, i) => (
                  <React.Fragment key={i}>
                    <tr className={!inv.include ? "opacity-40" : ""}>
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={inv.include}
                          onChange={e => updateInvoice(i, { include: e.target.checked })}
                          className="rounded"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={inv.numInput}
                          onChange={e => updateInvoice(i, { numInput: e.target.value })}
                          placeholder="Sin número"
                          className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="date"
                          value={inv.dateInput}
                          onChange={e => updateInvoice(i, { dateInput: e.target.value })}
                          className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={inv.amountEuros}
                          onChange={e => updateInvoice(i, { amountEuros: e.target.value })}
                          placeholder="0.00"
                          className={`w-24 rounded border bg-background px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring ${
                            !inv.amountEuros || inv.amountEuros === "0.00" ? "border-amber-400" : "border-input"
                          }`}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center whitespace-nowrap">
                        {inv.vatLines.length > 1 ? (
                          <span
                            className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300"
                            title={inv.vatLines.map(v => `${v.vatRate}%: ${(v.baseAmountInCents / 100).toFixed(2)}€`).join(" | ")}
                          >
                            {inv.vatLines.map(v => `${v.vatRate}%`).join("/")}
                          </span>
                        ) : inv.vatLines.length === 1 ? (
                          <span className="text-xs text-muted-foreground">{inv.vatLines[0].vatRate}%</span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 min-w-[180px]">
                        <select
                          value={inv.resolvedSupplierId ?? ""}
                          onChange={e => updateInvoice(i, { resolvedSupplierId: e.target.value || null })}
                          className={`w-full rounded border bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring ${
                            inv.include && !inv.resolvedSupplierId
                              ? "border-destructive/50 text-muted-foreground"
                              : "border-input"
                          }`}
                        >
                          <option value="">— Sin asignar —</option>
                          {suppliers.filter(s => s.isActive).map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        {inv.detectedSupplierName && (
                          <p className="text-muted-foreground/50 text-[10px] mt-0.5 truncate" title={inv.detectedSupplierName}>
                            IA: {inv.detectedSupplierName}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {inv.lineItems.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => updateInvoice(i, { showItems: !inv.showItems })}
                            className="text-primary hover:underline text-xs"
                          >
                            {inv.showItems ? "▲ ocultar" : `▼ ${inv.lineItems.length} artículo${inv.lineItems.length !== 1 ? "s" : ""}`}
                          </button>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => setInvoices(prev => prev.filter((_, idx) => idx !== i))}
                          title="Eliminar fila"
                          className="text-muted-foreground/50 hover:text-destructive text-xs"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>

                    {inv.showItems && inv.lineItems.length > 0 && (
                      <tr key={`${i}-items`} className={!inv.include ? "opacity-40" : ""}>
                        <td colSpan={8} className="px-3 pb-3 pt-0 bg-muted/10">
                          <div className="rounded border border-border/60 overflow-x-auto mt-1">
                            <table className="w-full text-xs">
                              <thead className="bg-muted/30">
                                <tr>
                                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Descripción</th>
                                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Cant.</th>
                                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">P. unit.</th>
                                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Total</th>
                                  {createOrder && (
                                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Producto</th>
                                  )}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/40">
                                {inv.lineItems.map((li, liIdx) => (
                                  <tr key={liIdx}>
                                    <td className="px-2 py-1.5 max-w-[180px]">
                                      <span className="truncate block" title={li.rawDescription}>{li.rawDescription}</span>
                                    </td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">{li.quantity ?? "—"}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtEuros(li.unitPriceInCents)}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtEuros(li.totalInCents)}</td>
                                    {createOrder && (
                                      <td className="px-2 py-1.5 min-w-[160px]">
                                        {li.isNewProduct ? (
                                          <div className="flex items-center gap-1">
                                            <span className="text-amber-500 text-xs">🆕</span>
                                            <input
                                              type="text"
                                              value={li.newProductName}
                                              onChange={e => updateLineItem(i, liIdx, { newProductName: e.target.value })}
                                              placeholder="Nombre nuevo producto"
                                              className="flex-1 rounded border border-amber-300 bg-background px-1.5 py-0.5 text-xs focus:outline-none"
                                            />
                                            {products.length > 0 && (
                                              <button type="button" onClick={() => updateLineItem(i, liIdx, { isNewProduct: false })} className="text-muted-foreground hover:text-foreground text-xs" title="Vincular a existente">🔗</button>
                                            )}
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-1">
                                            <span className="text-xs">{li.productId ? "✅" : "⚠️"}</span>
                                            <select
                                              value={li.productId ?? ""}
                                              onChange={e => {
                                                const val = e.target.value;
                                                if (val === "__new__") updateLineItem(i, liIdx, { isNewProduct: true, productId: null });
                                                else updateLineItem(i, liIdx, { productId: val || null });
                                              }}
                                              className="flex-1 rounded border border-input bg-background px-1 py-0.5 text-xs focus:outline-none"
                                            >
                                              <option value="">— Sin vincular —</option>
                                              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                              <option value="__new__">🆕 Crear nuevo…</option>
                                            </select>
                                          </div>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={() => setInvoices(prev => [...prev, emptyInvoice()])}
            className="text-xs text-primary hover:underline"
          >
            + Añadir factura
          </button>

          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>
                {selectedCount} seleccionada{selectedCount !== 1 ? "s" : ""}
                {invoices.some(inv => inv.include && (!inv.amountEuros || inv.amountEuros === "0.00")) && (
                  <span className="ml-2 text-amber-600">· revisa importes en 0</span>
                )}
              </p>
              {unassignedSelected > 0 && (
                <p className="text-destructive/80">
                  · {unassignedSelected} factura{unassignedSelected !== 1 ? "s" : ""} sin proveedor (se usará el mayoritario)
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={stage === "saving" || selectedCount === 0 || isPending}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {stage === "saving"
                ? "Guardando…"
                : `Guardar ${selectedCount} factura${selectedCount !== 1 ? "s" : ""}${createOrder ? " + pedido" : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
