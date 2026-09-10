"use client";

/**
 * Vista de facturas y bundles de un proveedor organizada por año → trimestre.
 * Los bundles (escáneres) aparecen en una sección plana por encima del acordeón,
 * ya que su fecha de subida no debe afectar a qué trimestre pertenecen las facturas.
 * Las facturas se agrupan únicamente por su invoiceDate.
 */
import { useState } from "react";
import { BundleUploadForm } from "./BundleUploadForm";
import { BundleExtractButton } from "./BundleExtractButton";
import { BundleDeleteButton } from "./BundleDeleteButton";
import { InvoiceEditModal } from "./InvoiceEditModal";
import { InvoiceDeleteButton } from "./InvoiceDeleteButton";
import { createBundleAction } from "@/modules/suppliers/actions/bundles";
import type { InvoiceRow, BundleRow } from "@/modules/suppliers/types";
import { MarkPaidButton } from "./MarkPaidButton";
import { QuarterStatusWidget } from "./QuarterStatusWidget";
import type { QuarterStatusRow } from "@/modules/suppliers/actions/quarterStatus";
import { markInvoicePaidAction } from "@/modules/suppliers/actions/invoices";

// ── Helpers ───────────────────────────────────────────────────────────────────

function euros(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function quarterOf(dateStr: string): { year: number; q: number } {
  const [y, m] = dateStr.split("-").map(Number);
  return { year: y, q: Math.ceil(m / 3) };
}

function quarterKey(year: number, q: number) { return `${year}-Q${q}`; }

const Q_LABELS = ["", "T1 · Ene–Mar", "T2 · Abr–Jun", "T3 · Jul–Sep", "T4 · Oct–Dic"];

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuarterData {
  year: number;
  q: number;
  invoices: InvoiceRow[];
}

interface Props {
  supplierId: string;
  invoices: InvoiceRow[];
  bundles: BundleRow[];
  canWrite: boolean;
  InvoiceFormSlot?: React.ReactNode;
  quarterStatuses?: QuarterStatusRow[];
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────

function InvoiceFormModal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card rounded-xl border shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h2 className="font-semibold text-base">Registrar factura individual</h2>
          <button type="button" onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl leading-none">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── BundlesSection ────────────────────────────────────────────────────────────

function BundlesSection({ supplierId, bundles, canWrite }: {
  supplierId: string;
  bundles: BundleRow[];
  canWrite: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const sorted = [...bundles].sort((a, b) => b.bundleDate.localeCompare(a.bundleDate));

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
        <h3 className="text-sm font-semibold">
          📁 Escáneres subidos
          <span className="ml-2 text-xs font-normal text-muted-foreground">({bundles.length})</span>
        </h3>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowForm(v => !v)}
            className="text-xs text-primary hover:underline"
          >
            {showForm ? "Cancelar" : "+ Subir escáner"}
          </button>
        )}
      </div>

      {showForm && (
        <div className="border-t p-4 bg-muted/10">
          <BundleUploadForm supplierId={supplierId} action={createBundleAction} onSuccess={() => setShowForm(false)} />
        </div>
      )}

      {sorted.length === 0 && !showForm && (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">Sin escáneres registrados.</p>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="divide-y">
          {sorted.map(b => (
            <div key={b.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-medium text-sm truncate">{b.description ?? "Escáner múltiple"}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{b.bundleDate}</span>
                  {b.pageCount && <span className="ml-1 text-xs text-muted-foreground">· {b.pageCount} pág.</span>}
                  <span className={`ml-2 text-xs ${b.invoiceCount > 0 ? "text-foreground font-medium" : "text-amber-600"}`}>
                    · {b.invoiceCount} factura{b.invoiceCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <a
                  href={`/api/files/bundles/${b.fileId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
                >
                  Ver PDF
                </a>
              </div>
              {canWrite && (
                <div className="mt-2 pt-2 border-t border-border/50 flex items-start justify-between gap-4">
                  <BundleExtractButton bundleId={b.id} supplierId={supplierId} />
                  <BundleDeleteButton
                    bundleId={b.id}
                    invoiceCount={b.invoiceCount}
                    description={b.description}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SupplierQuarterView({ supplierId, invoices, bundles, canWrite, InvoiceFormSlot, quarterStatuses = [] }: Props) {
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => {
    const now = new Date();
    const curKey = quarterKey(now.getFullYear(), Math.ceil((now.getMonth() + 1) / 3));
    return new Set([curKey]);
  });
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRow | null>(null);

  // Detectar duplicados: misma combinación (número, fecha, total) en todo el proveedor
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

  // Agrupar facturas por año/trimestre (bundles ya NO se agrupan aquí)
  const quarterMap = new Map<string, QuarterData>();
  for (const inv of invoices) {
    const { year, q } = quarterOf(inv.invoiceDate);
    const key = quarterKey(year, q);
    if (!quarterMap.has(key)) quarterMap.set(key, { year, q, invoices: [] });
    quarterMap.get(key)!.invoices.push(inv);
  }

  const quarters = Array.from(quarterMap.values()).sort(
    (a, b) => b.year - a.year || b.q - a.q
  );

  // Mapa de estado por clave año-trimestre
  const statusMap = new Map<string, QuarterStatusRow>();
  for (const qs of quarterStatuses) {
    statusMap.set(quarterKey(qs.year, qs.quarter), qs);
  }

  function toggle(key: string) {
    setOpenKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Edit modal */}
      {editingInvoice && (
        <InvoiceEditModal
          invoice={editingInvoice}
          onClose={() => setEditingInvoice(null)}
        />
      )}

      {/* Botón registrar factura */}
      {canWrite && InvoiceFormSlot && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowInvoiceModal(true)}
            className="text-xs text-primary hover:underline"
          >
            + Registrar factura
          </button>
        </div>
      )}

      {/* Modal factura individual */}
      {showInvoiceModal && InvoiceFormSlot && (
        <InvoiceFormModal onClose={() => setShowInvoiceModal(false)}>
          {InvoiceFormSlot}
        </InvoiceFormModal>
      )}

      {/* Sección de bundles (plana, sin trimestre) */}
      <BundlesSection supplierId={supplierId} bundles={bundles} canWrite={canWrite} />

      {/* Sin facturas */}
      {quarters.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">Sin facturas registradas.</p>
        </div>
      )}

      {/* Acordeón por trimestre (solo facturas) */}
      {quarters.map(({ year, q, invoices: qInvoices }) => {
        const key = quarterKey(year, q);
        const isOpen = openKeys.has(key);
        const total = qInvoices.reduce((s, i) => s + i.totalInCents, 0);
        const paid = qInvoices.filter(i => i.isPaid).reduce((s, i) => s + i.totalInCents, 0);
        const pending = total - paid;

        return (
          <div key={key} className="rounded-lg border overflow-hidden">
            {/* Cabecera trimestre */}
            <button
              type="button"
              onClick={() => toggle(key)}
              className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 text-left"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-semibold text-sm">{Q_LABELS[q]}</span>
                <span className="text-xs text-muted-foreground">{year}</span>
                <span className="text-xs text-muted-foreground">
                  {qInvoices.length} factura{qInvoices.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                {total > 0 && (
                  <div className="text-right text-xs">
                    <span className="font-semibold text-sm">{euros(total)}</span>
                    {pending > 0 && (
                      <span className="ml-2 text-amber-600">{euros(pending)} pendiente</span>
                    )}
                  </div>
                )}
                <span className="text-muted-foreground text-xs">{isOpen ? "▲" : "▼"}</span>
              </div>
            </button>
            {/* Estado del trimestre */}
            <div className="px-4 pb-2 bg-muted/30 border-t border-border/40">
              <QuarterStatusWidget
                supplierId={supplierId}
                year={year}
                quarter={q}
                status={statusMap.get(key) ?? null}
                canWrite={canWrite}
              />
            </div>

            {/* Tabla de facturas */}
            {isOpen && (
              <div className="p-4">
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-xs min-w-[520px]">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Nº / Fecha</th>
                        <th className="px-3 py-2 text-right font-medium">Total</th>
                        <th className="px-3 py-2 text-left font-medium">Estado</th>
                        <th className="px-3 py-2 text-left font-medium">Origen</th>
                        {canWrite && <th className="px-3 py-2 text-right font-medium">Acciones</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {qInvoices
                        .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))
                        .map(inv => (
                          <tr key={inv.id} className={`hover:bg-muted/10 ${isDuplicate(inv) ? "bg-red-50/40 dark:bg-red-900/10" : inv.totalInCents < 0 ? "bg-orange-50/40 dark:bg-orange-900/10" : ""}`}>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-medium">{inv.invoiceNumber ?? "—"}</p>
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
                              <p className="text-muted-foreground">{inv.invoiceDate}</p>
                            </td>
                            <td className={`px-3 py-2 text-right font-medium ${inv.totalInCents < 0 ? "text-orange-600 dark:text-orange-400" : ""}`}>{euros(inv.totalInCents)}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                inv.isPaid
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              }`}>
                                {inv.isPaid ? "Pagada" : "Pendiente"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {inv.bundleFileId ? (
                                <a href={`/api/files/bundles/${inv.bundleFileId}`} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                  title={`Escáner ${inv.bundleDate ?? ""}`}>
                                  📄 Escáner {inv.bundleDate}
                                </a>
                              ) : inv.fileId ? (
                                <a href={`/api/files/invoices/${inv.fileId}`} target="_blank" rel="noopener noreferrer"
                                  className="text-primary hover:underline">
                                  📄 PDF individual
                                </a>
                              ) : (
                                <span className="text-muted-foreground/50">Sin documento</span>
                              )}
                            </td>
                            {canWrite && (
                              <td className="px-3 py-2 text-right">
                                <div className="flex items-center justify-end gap-2">
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
                    {/* Totales */}
                    <tfoot className="bg-muted/20 border-t">
                      <tr>
                        <td className="px-3 py-2 text-xs font-semibold" colSpan={2}>
                          Total: {euros(total)}
                        </td>
                        <td className="px-3 py-2 text-xs text-green-700 dark:text-green-400 font-medium">
                          Pagado: {euros(paid)}
                        </td>
                        <td className="px-3 py-2 text-xs text-amber-600 font-medium" colSpan={canWrite ? 2 : 1}>
                          Pendiente: {euros(pending)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
