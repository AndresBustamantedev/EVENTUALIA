"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  removeInvoiceFromPackageAction,
  markPackageSentAction,
  markPackageConfirmedAction,
  setPackageStatusAction,
} from "@/modules/gestoria/actions/packages";
import { getInvoiceAction } from "@/modules/suppliers/actions/invoices";
import { InvoiceDetailPanel } from "@/modules/suppliers/components/InvoiceDetailPanel";
import { AddInvoicesPanel } from "./AddInvoicesPanel";
import {
  GESTORIA_STATUS_LABELS,
  QUARTER_LABELS,
  type GestoriaPackageRow,
  type GestoriaItemRow,
  type CandidateInvoice,
} from "@/modules/gestoria/types";
import type { InvoiceRow } from "@/modules/suppliers/types";

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT:     "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  SENT:      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  CONFIRMED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

interface Props {
  pkg:        GestoriaPackageRow;
  items:      GestoriaItemRow[];
  candidates: CandidateInvoice[];
  canWrite:   boolean;
  canConfirm: boolean;
  isAdmin:    boolean;
}

export function PackageDetailClient({ pkg, items, candidates, canWrite, canConfirm, isAdmin }: Props) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmSend, setConfirmSend] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
  const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null);

  async function handleOpenInvoice(invoiceId: string) {
    setLoadingInvoiceId(invoiceId);
    try {
      const inv = await getInvoiceAction(invoiceId);
      if (inv) setSelectedInvoice(inv);
    } finally {
      setLoadingInvoiceId(null);
    }
  }

  // Agrupar ítems por proveedor
  const bySupplier = items.reduce<Record<string, GestoriaItemRow[]>>((acc, item) => {
    (acc[item.supplierName] ??= []).push(item);
    return acc;
  }, {});

  function handleRemove(itemId: string) {
    setActionError(null);
    startTransition(async () => {
      const res = await removeInvoiceFromPackageAction(itemId, pkg.id);
      if (res.error) setActionError(res.error);
      else router.refresh();
    });
  }

  function handleMarkSent() {
    setActionError(null);
    startTransition(async () => {
      const res = await markPackageSentAction(pkg.id);
      if (res.error) { setActionError(res.error); setConfirmSend(false); return; }
      router.refresh();
      setConfirmSend(false);
    });
  }

  function handleMarkConfirmed() {
    setActionError(null);
    startTransition(async () => {
      const res = await markPackageConfirmedAction(pkg.id);
      if (res.error) setActionError(res.error);
      else router.refresh();
    });
  }

  function handleSetStatus(status: "DRAFT" | "SENT" | "CONFIRMED") {
    setActionError(null);
    startTransition(async () => {
      const res = await setPackageStatusAction(pkg.id, status);
      if (res.error) setActionError(res.error);
      else router.refresh();
    });
  }

  const isDraft    = pkg.status === "DRAFT";
  const isSent     = pkg.status === "SENT";
  const isConfirmed = pkg.status === "CONFIRMED";

  return (
    <div className="space-y-6">
      {/* ── Cabecera ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold">
              {QUARTER_LABELS[pkg.quarter]} · {pkg.year}
            </h1>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[pkg.status]}`}>
              {GESTORIA_STATUS_LABELS[pkg.status]}
            </span>
          </div>
          {pkg.description && (
            <p className="text-sm text-muted-foreground mt-1">{pkg.description}</p>
          )}
          {pkg.sentAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Enviado: {new Date(pkg.sentAt).toLocaleDateString("es-ES")}
              {pkg.confirmedAt && ` · Confirmado: ${new Date(pkg.confirmedAt).toLocaleDateString("es-ES")}`}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {/* ADMIN / RRHH: editar borrador */}
          {canWrite && isDraft && (
            <button type="button" onClick={() => setShowAdd(true)} disabled={isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              + Añadir facturas
            </button>
          )}
          {canWrite && isDraft && items.length > 0 && !confirmSend && (
            <button type="button" onClick={() => setConfirmSend(true)} disabled={isPending}
              className="rounded-md border border-blue-500 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 disabled:opacity-60">
              Enviar a gestoría
            </button>
          )}

          {/* GESTORIA: confirmar paquete recibido */}
          {canConfirm && !canWrite && isSent && (
            <button type="button" onClick={handleMarkConfirmed} disabled={isPending}
              className="rounded-md border border-green-500 px-4 py-2 text-sm text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20 disabled:opacity-60">
              {isPending ? "Guardando…" : "✓ Recibido"}
            </button>
          )}

          {/* ADMIN: selector de estado libre */}
          {isAdmin && (
            <div className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
              <span className="text-xs text-muted-foreground">Estado:</span>
              {(["DRAFT", "SENT", "CONFIRMED"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => pkg.status !== s && handleSetStatus(s)}
                  disabled={isPending || pkg.status === s}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition-colors disabled:cursor-default ${
                    pkg.status === s
                      ? s === "DRAFT"   ? "bg-amber-500 text-white"
                      : s === "SENT"    ? "bg-blue-600 text-white"
                      :                   "bg-green-600 text-white"
                      : "text-muted-foreground hover:bg-muted disabled:opacity-50"
                  }`}
                  title={s === "DRAFT" ? "En preparación" : s === "SENT" ? "En gestoría" : "Recibido"}
                >
                  {s === "DRAFT" ? "Borrador" : s === "SENT" ? "Enviado" : "Recibido"}
                </button>
              ))}
            </div>
          )}

          {/* Descargar ZIP de PDFs */}
          {items.some(i => i.fileId || i.bundleFileId) && (
            <a
              href={`/api/gestoria/${pkg.id}/download-zip`}
              download
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted/50 inline-flex items-center gap-1.5"
            >
              📦 Descargar ZIP
            </a>
          )}
        </div>
      </div>

      {/* ── Confirmación de envío ── */}
      {confirmSend && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 p-4 space-y-3">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
            ¿Marcar este paquete como "En gestoría"? No podrás añadir ni quitar facturas después.
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={handleMarkSent} disabled={isPending}
              style={{ background: "#2563eb", color: "#fff", padding: "6px 16px", borderRadius: "6px", fontSize: "14px", fontWeight: 500, opacity: isPending ? 0.6 : 1, cursor: isPending ? "not-allowed" : "pointer" }}>
              {isPending ? "Enviando…" : "Sí, marcar como enviado"}
            </button>
            <button type="button" onClick={() => setConfirmSend(false)} disabled={isPending}
              className="rounded-md border px-4 py-1.5 text-sm hover:bg-muted disabled:opacity-60">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <p className="text-sm text-destructive">{actionError}</p>
      )}

      {/* ── Resumen ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground mb-1">Facturas</p>
          <p className="text-2xl font-bold">{items.length}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground mb-1">Total</p>
          <p className="text-2xl font-bold">{formatEuros(pkg.totalInCents)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground mb-1">Proveedores</p>
          <p className="text-2xl font-bold">{Object.keys(bySupplier).length}</p>
        </div>
      </div>

      {/* ── Facturas por proveedor ── */}
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-muted-foreground text-sm">Sin facturas en este paquete.</p>
          {canWrite && isDraft && (
            <button type="button" onClick={() => setShowAdd(true)}
              className="mt-3 text-sm text-primary hover:underline">
              + Añadir facturas del trimestre
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(bySupplier).map(([supplierName, supplierItems]) => {
            const subtotal = supplierItems.reduce((acc, i) => acc + i.totalInCents, 0);
            return (
              <div key={supplierName} className="rounded-lg border overflow-hidden">
                <div className="flex items-center justify-between bg-muted/40 px-4 py-2.5">
                  <p className="text-sm font-semibold">{supplierName}</p>
                  <p className="text-sm font-mono">{formatEuros(subtotal)}</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="px-4 py-2 text-left font-medium">Nº factura</th>
                      <th className="px-4 py-2 text-left font-medium">Fecha</th>
                      <th className="px-4 py-2 text-right font-medium">Total</th>
                      <th className="px-4 py-2 text-center font-medium">Pagada</th>
                      <th className="px-4 py-2 text-center font-medium">PDF</th>
                      {canWrite && isDraft && <th className="px-4 py-2" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {supplierItems.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => handleOpenInvoice(item.invoiceId)}
                            disabled={loadingInvoiceId === item.invoiceId}
                            className="text-primary hover:underline text-left disabled:opacity-60"
                            title="Ver detalle de la factura"
                          >
                            {loadingInvoiceId === item.invoiceId
                              ? <span className="text-muted-foreground text-xs">…</span>
                              : (item.invoiceNumber ?? <span className="text-muted-foreground italic text-xs">Sin nº</span>)
                            }
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{item.invoiceDate}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{formatEuros(item.totalInCents)}</td>
                        <td className="px-4 py-2.5 text-center">
                          {item.isPaid
                            ? <span className="text-green-600 dark:text-green-400">✓</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {item.fileId ? (
                            <a href={`/api/files/invoices/${item.fileId}`} target="_blank" rel="noopener noreferrer"
                              className="text-primary hover:text-primary/80 text-base" title="Ver PDF">
                              📄
                            </a>
                          ) : item.bundleFileId ? (
                            <a href={`/api/files/bundles/${item.bundleFileId}`} target="_blank" rel="noopener noreferrer"
                              className="text-primary hover:text-primary/80 text-base" title="Ver escáner (PDF del bundle)">
                              📄
                            </a>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </td>
                        {canWrite && isDraft && (
                          <td className="px-4 py-2.5 text-right">
                            <button type="button" onClick={() => handleRemove(item.id)}
                              disabled={isPending}
                              className="text-xs text-destructive hover:underline disabled:opacity-50">
                              Quitar
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {pkg.notes && (
        <div className="rounded-lg border bg-muted/20 p-4">
          <p className="text-xs font-medium text-muted-foreground mb-1">Notas</p>
          <p className="text-sm">{pkg.notes}</p>
        </div>
      )}

      {/* ── Panel añadir facturas ── */}
      {showAdd && (
        <AddInvoicesPanel
          packageId={pkg.id}
          candidates={candidates}
          onClose={() => setShowAdd(false)}
        />
      )}

      {/* ── Panel detalle factura (solo lectura) ── */}
      {selectedInvoice && (
        <InvoiceDetailPanel
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          readOnly
        />
      )}
    </div>
  );
}
