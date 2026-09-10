"use client";
import React from "react";

/**
 * Botón que extrae facturas de un bundle PDF con IA (Claude API).
 * Muestra las líneas extraídas en una tabla editable para que el usuario
 * las revise y confirme antes de guardarlas.
 * Opcionalmente registra también los artículos como pedido y productos.
 */
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  extractBundleInvoicesAction,
  saveExtractedInvoicesAction,
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
  // Product matching
  productId:        string | null;  // null = new product or skip
  newProductName:   string;         // name for a new product (pre-filled from rawDescription)
  isNewProduct:     boolean;        // true = create new, false = use productId or skip
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
  resolvedSupplierId:   string | null; // null = usar el proveedor del bundle
  vatLines:             VatLineExtracted[];
}

interface Props {
  bundleId:   string;
  supplierId: string;
}

type Stage = "idle" | "extracting" | "review" | "saving" | "done";

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
  // Simple substring match
  const found = products.find(p => desc.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(desc.substring(0, 10)));
  return found?.id ?? null;
}

function matchSupplier(name: string | null, cif: string | null, suppliers: SupplierRow[]): string | null {
  if (!suppliers.length) return null;
  // Match by CIF first (more reliable)
  if (cif && cif.length >= 7) {
    const norm = cif.replace(/[-\s]/g, "").toUpperCase();
    const found = suppliers.find(s => s.taxId?.replace(/[-\s]/g, "").toUpperCase() === norm);
    if (found) return found.id;
  }
  // Match by name (contains)
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

// ── Component ─────────────────────────────────────────────────────────────────

export function BundleExtractButton({ bundleId, supplierId }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<EditableInvoice[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [createOrder, setCreateOrder] = useState(false);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);

  // Load products when order toggle is turned on
  useEffect(() => {
    if (createOrder && products.length === 0) {
      listProducts(false).then(setProducts).catch(() => {});
    }
  }, [createOrder, products.length]);

  function handleExtract() {
    setError(null);
    startTransition(async () => {
      setStage("extracting");
      let result: Awaited<ReturnType<typeof extractBundleInvoicesAction>> | undefined;
      try {
        result = await extractBundleInvoicesAction(bundleId);
      } catch (e: unknown) {
        setError(`Error inesperado: ${e instanceof Error ? e.message : String(e)}`);
        setStage("idle");
        return;
      }
      if (!result || result.error) {
        setError(result?.error ?? "Error desconocido. Revisa los logs del servidor.");
        setStage("idle");
        return;
      }
      const raw = result.lines ?? [];
      if (raw.length === 0) {
        setError("La IA no detectó facturas en este PDF. Usa '✎ Registrar manualmente' para introducirlas a mano, o sube un PDF con mejor calidad de escaneado.");
        setStage("idle");
        return;
      }
      const today = new Date().toISOString().split("T")[0];
      const [prods, supps] = await Promise.all([
        listProducts(false).catch(() => [] as ProductRow[]),
        listSuppliers().catch(() => [] as SupplierRow[]),
      ]);
      setProducts(prods);
      setSuppliers(supps);

      setInvoices(
        raw.map((l: ExtractedBundleLine) => {
          const detectedName = l.supplierName ?? null;
          const detectedCif = l.supplierCif ?? null;
          const matchedId = matchSupplier(detectedName, detectedCif, supps);
          return {
          include:              true,
          numInput:             l.invoiceNumber ?? "",
          dateInput:            l.invoiceDate ?? today,
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
        })
      );
      setStage("review");
    });
  }

  function updateInvoice(i: number, patch: Partial<EditableInvoice>) {
    setInvoices(prev => prev.map((inv, idx) => idx === i ? { ...inv, ...patch } : inv));
  }

  function updateLineItem(invIdx: number, liIdx: number, patch: Partial<EditableLineItem>) {
    setInvoices(prev => prev.map((inv, idx) => {
      if (idx !== invIdx) return inv;
      return {
        ...inv,
        lineItems: inv.lineItems.map((li, lidx) => lidx === liIdx ? { ...li, ...patch } : li),
      };
    }));
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

  function handleManual() {
    setError(null);
    setInvoices([emptyInvoice()]);
    setStage("review");
  }

  function addManualRow() {
    setInvoices(prev => [...prev, emptyInvoice()]);
  }

  function removeInvoice(i: number) {
    setInvoices(prev => prev.filter((_, idx) => idx !== i));
  }

  function handleSave() {
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
    setError(null);
    setStage("saving");
    startTransition(async () => {
      const result = await saveExtractedInvoicesAction(bundleId, supplierId, toSave, createOrder);
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

  const selectedCount = invoices.filter(inv => inv.include).length;

  // ── Done ──────────────────────────────────────────────────────────────────

  if (stage === "done") {
    return (
      <span className="text-xs text-emerald-600 font-medium">
        ✓ {savedCount} factura{savedCount !== 1 ? "s" : ""} guardada{savedCount !== 1 ? "s" : ""}
        {createOrder ? " · pedidos registrados" : ""}
      </span>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-1">
      {error && stage !== "review" && stage !== "saving" && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {stage === "idle" && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExtract}
            disabled={isPending}
            className="text-xs text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
          >
            ✦ Extraer facturas con IA
          </button>
          <span className="text-muted-foreground/40 text-xs">·</span>
          <button
            type="button"
            onClick={handleManual}
            disabled={isPending}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline flex items-center gap-1 disabled:opacity-50"
          >
            ✎ Registrar manualmente
          </button>
        </div>
      )}

      {stage === "extracting" && (
        <span className="text-xs text-muted-foreground animate-pulse">
          Analizando PDF con IA… (puede tardar 10–30 segundos)
        </span>
      )}

      {(stage === "review" || stage === "saving") && (
        <div className="mt-3 space-y-3">
          {/* Cabecera */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">
              {invoices.length} factura{invoices.length !== 1 ? "s" : ""} detectada{invoices.length !== 1 ? "s" : ""} — revisa y confirma
            </p>
            <button
              type="button"
              onClick={() => { setStage("idle"); setError(null); }}
              className="text-xs text-muted-foreground hover:underline"
            >
              Cancelar
            </button>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {/* Toggle: crear pedido */}
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none rounded-md border border-border/50 bg-muted/20 px-3 py-2">
            <input
              type="checkbox"
              checked={createOrder}
              onChange={e => setCreateOrder(e.target.checked)}
              className="rounded"
            />
            <span className="font-medium">📦 Registrar también como pedido y productos</span>
            <span className="text-muted-foreground">(vincula artículos a productos del catálogo)</span>
          </label>

          {/* Tabla de facturas */}
          <div className="rounded-md border border-border overflow-x-auto">
            <table className="w-full text-xs">
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
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">Artículos</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">Proveedor</th>
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
                            className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300 whitespace-nowrap"
                            title={inv.vatLines.map(v => `${v.vatRate}%: ${(v.baseAmountInCents / 100).toFixed(2)}€`).join(' | ')}
                          >
                            {inv.vatLines.map(v => `${v.vatRate}%`).join('/')}
                          </span>
                        ) : inv.vatLines.length === 1 ? (
                          <span className="text-xs text-muted-foreground">{inv.vatLines[0].vatRate}%</span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
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
                      <td className="px-2 py-1.5 min-w-[140px]">
                        {suppliers.length > 1 ? (
                          <select
                            value={inv.resolvedSupplierId ?? ""}
                            onChange={e => updateInvoice(i, { resolvedSupplierId: e.target.value || null })}
                            className={`w-full rounded border bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring ${
                              inv.resolvedSupplierId && inv.resolvedSupplierId !== supplierId
                                ? "border-amber-400 text-amber-700 dark:text-amber-400"
                                : "border-input text-muted-foreground"
                            }`}
                          >
                            <option value="">— Bundle —</option>
                            {suppliers.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-muted-foreground/50 text-xs">—</span>
                        )}
                        {inv.detectedSupplierName && (
                          <p className="text-muted-foreground/50 text-[10px] mt-0.5 truncate" title={inv.detectedSupplierName}>
                            IA: {inv.detectedSupplierName}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeInvoice(i)}
                          title="Eliminar fila"
                          className="text-muted-foreground/50 hover:text-destructive text-xs leading-none"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>

                    {/* Sub-tabla de artículos */}
                    {inv.showItems && inv.lineItems.length > 0 && (
                      <tr key={`${i}-items`} className={!inv.include ? "opacity-40" : ""}>
                        <td colSpan={6} className="px-3 pb-3 pt-0 bg-muted/10">
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
                                          <div className="space-y-1">
                                            <div className="flex items-center gap-1">
                                              <span className="text-amber-500 text-xs">🆕</span>
                                              <input
                                                type="text"
                                                value={li.newProductName}
                                                onChange={e => updateLineItem(i, liIdx, { newProductName: e.target.value })}
                                                placeholder="Nombre nuevo producto"
                                                className="flex-1 rounded border border-amber-300 bg-background px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                              />
                                              {products.length > 0 && (
                                                <button
                                                  type="button"
                                                  onClick={() => updateLineItem(i, liIdx, { isNewProduct: false })}
                                                  className="text-muted-foreground hover:text-foreground text-xs"
                                                  title="Vincular a existente"
                                                >
                                                  🔗
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-1">
                                            <span className="text-emerald-500 text-xs">
                                              {li.productId ? "✅" : "⚠️"}
                                            </span>
                                            <select
                                              value={li.productId ?? ""}
                                              onChange={e => {
                                                const val = e.target.value;
                                                if (val === "__new__") {
                                                  updateLineItem(i, liIdx, { isNewProduct: true, productId: null });
                                                } else {
                                                  updateLineItem(i, liIdx, { productId: val || null });
                                                }
                                              }}
                                              className="flex-1 rounded border border-input bg-background px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                            >
                                              <option value="">— Sin vincular —</option>
                                              {products.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                              ))}
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

          {/* Añadir fila manual */}
          <button
            type="button"
            onClick={addManualRow}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            + Añadir factura
          </button>

          {/* Pie */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {selectedCount} seleccionada{selectedCount !== 1 ? "s" : ""}
              {invoices.some(inv => inv.include && (!inv.amountEuros || inv.amountEuros === "0.00")) && (
                <span className="ml-2 text-amber-600">· revisa importes en 0</span>
              )}
            </p>
            <button
              type="button"
              onClick={handleSave}
              disabled={stage === "saving" || selectedCount === 0}
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
