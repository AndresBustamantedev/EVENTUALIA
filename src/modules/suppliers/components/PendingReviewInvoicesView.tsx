"use client";

/**
 * Vista de facturas recibidas por email pendientes de aceptar.
 * Cada fila muestra el proveedor auto-asignado y permite:
 *   ✓ Aceptar  — confirma la asignación tal como está
 *   ↗ Reasignar — cambia a otro proveedor y acepta en un paso
 */
import { useState, useTransition } from "react";
import { acceptInvoiceAction, reassignInvoiceAction } from "@/modules/suppliers/actions/invoices";
import type { InvoiceRow, SupplierRow } from "@/modules/suppliers/types";

interface Props {
  invoices:  InvoiceRow[];
  suppliers: SupplierRow[];   // proveedores activos (para el desplegable de reasignación)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function centsToEuros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PendingReviewInvoicesView({ invoices, suppliers }: Props) {
  const [done, setDone]             = useState<Set<string>>(new Set());
  const [reassigning, setReassigning] = useState<Set<string>>(new Set());
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [errors, setErrors]         = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const visible = invoices.filter(inv => !done.has(inv.id));

  function markDone(id: string) {
    setDone(prev => new Set([...prev, id]));
  }

  function handleAccept(invoiceId: string) {
    setErrors(prev => { const n = { ...prev }; delete n[invoiceId]; return n; });
    startTransition(async () => {
      const res = await acceptInvoiceAction(invoiceId);
      if (res.error) setErrors(prev => ({ ...prev, [invoiceId]: res.error! }));
      else markDone(invoiceId);
    });
  }

  function handleReassign(invoiceId: string) {
    const newSupplierId = selections[invoiceId];
    if (!newSupplierId) {
      setErrors(prev => ({ ...prev, [invoiceId]: "Selecciona un proveedor primero." }));
      return;
    }
    setErrors(prev => { const n = { ...prev }; delete n[invoiceId]; return n; });
    startTransition(async () => {
      const res = await reassignInvoiceAction(invoiceId, newSupplierId);
      if (res.error) setErrors(prev => ({ ...prev, [invoiceId]: res.error! }));
      else markDone(invoiceId);
    });
  }

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center">
        <p className="text-3xl mb-3">✓</p>
        <p className="text-muted-foreground text-sm">No hay facturas pendientes de aceptar. Todo al día.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
        <strong>{visible.length} factura{visible.length !== 1 ? "s" : ""}</strong> recibida{visible.length !== 1 ? "s" : ""} por email esperan confirmación.
        Acepta la asignación automática o corrígela antes de que quede registrada.
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground text-left">
              <tr>
                <th className="px-3 py-2.5 font-medium">Proveedor asignado</th>
                <th className="px-3 py-2.5 font-medium">Nº factura</th>
                <th className="px-3 py-2.5 font-medium">Fecha</th>
                <th className="px-3 py-2.5 font-medium text-right">Total</th>
                <th className="px-3 py-2.5 font-medium">PDF</th>
                <th className="px-3 py-2.5 font-medium" colSpan={2}>Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map(inv => {
                const isReassigning = reassigning.has(inv.id);
                const selected      = selections[inv.id] ?? "";
                const err           = errors[inv.id];

                return (
                  <tr key={inv.id} className="hover:bg-muted/20 align-top">
                    <td className="px-3 py-3 font-medium text-sm">
                      {inv.supplierName}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {inv.invoiceNumber ?? <span className="italic">Sin nº</span>}
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">
                      {formatDate(inv.invoiceDate)}
                    </td>
                    <td className="px-3 py-3 text-right font-medium whitespace-nowrap">
                      {centsToEuros(inv.totalInCents)} €
                    </td>
                    <td className="px-3 py-3">
                      {inv.fileId ? (
                        <a
                          href={`/api/files/invoices/${inv.fileId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded border border-input px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                        >
                          📄 Ver
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground/40 italic">Sin PDF</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {!isReassigning ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleAccept(inv.id)}
                            disabled={isPending}
                            className="rounded-md bg-green-600 hover:bg-green-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 whitespace-nowrap transition-colors"
                          >
                            ✓ Aceptar
                          </button>
                          <button
                            type="button"
                            onClick={() => setReassigning(prev => new Set([...prev, inv.id]))}
                            disabled={isPending}
                            className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 whitespace-nowrap transition-colors"
                          >
                            ↗ Cambiar proveedor
                          </button>
                          {err && <p className="w-full text-[10px] text-destructive">{err}</p>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <select
                            value={selected}
                            onChange={e => setSelections(prev => ({ ...prev, [inv.id]: e.target.value }))}
                            disabled={isPending}
                            className={`rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring min-w-[180px] ${
                              err ? "border-destructive" : "border-input"
                            }`}
                          >
                            <option value="">— Elige proveedor —</option>
                            {suppliers.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleReassign(inv.id)}
                            disabled={isPending || !selected}
                            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 whitespace-nowrap"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReassigning(prev => { const n = new Set(prev); n.delete(inv.id); return n; });
                              setErrors(prev => { const n = { ...prev }; delete n[inv.id]; return n; });
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            Cancelar
                          </button>
                          {err && <p className="w-full text-[10px] text-destructive">{err}</p>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
