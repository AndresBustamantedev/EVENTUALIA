"use client";

/**
 * Vista especial para el proveedor "Sin asignar".
 * Muestra una lista plana de facturas con un desplegable por fila para
 * reasignarlas a un proveedor real.
 */
import { useState, useTransition } from "react";
import { reassignInvoiceAction } from "@/modules/suppliers/actions/invoices";
import type { InvoiceRow, SupplierRow } from "@/modules/suppliers/types";

interface Props {
  invoices: InvoiceRow[];
  suppliers: SupplierRow[];   // proveedores activos (excluye "Sin asignar")
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function centsToEuros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function UnassignedInvoicesView({ invoices, suppliers }: Props) {
  // Per-row state: selected supplierId and saving status
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const visible = invoices.filter(inv => !saved.has(inv.id));

  function handleSelect(invoiceId: string, supplierId: string) {
    setSelections(prev => ({ ...prev, [invoiceId]: supplierId }));
    setErrors(prev => { const n = { ...prev }; delete n[invoiceId]; return n; });
  }

  function handleReassign(invoiceId: string) {
    const newSupplierId = selections[invoiceId];
    if (!newSupplierId) {
      setErrors(prev => ({ ...prev, [invoiceId]: "Selecciona un proveedor primero." }));
      return;
    }
    startTransition(async () => {
      const res = await reassignInvoiceAction(invoiceId, newSupplierId);
      if (res.error) {
        setErrors(prev => ({ ...prev, [invoiceId]: res.error! }));
      } else {
        setSaved(prev => new Set([...prev, invoiceId]));
      }
    });
  }

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center">
        <p className="text-2xl mb-3">✓</p>
        <p className="text-muted-foreground text-sm">Todas las facturas han sido reasignadas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        <strong>{visible.length} factura{visible.length !== 1 ? "s" : ""}</strong> sin proveedor asignado.
        Selecciona el proveedor correcto en cada fila y pulsa <em>Reasignar</em>.
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground text-left">
              <tr>
                <th className="px-3 py-2.5 font-medium">Nº factura</th>
                <th className="px-3 py-2.5 font-medium">Fecha</th>
                <th className="px-3 py-2.5 font-medium text-right">Total</th>
                <th className="px-3 py-2.5 font-medium">Proveedor detectado</th>
                <th className="px-3 py-2.5 font-medium">PDF</th>
                <th className="px-3 py-2.5 font-medium min-w-[200px]">Asignar a</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map(inv => {
                const selected = selections[inv.id] ?? "";
                const err = errors[inv.id];
                return (
                  <tr key={inv.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                      {inv.invoiceNumber ?? <span className="italic">Sin nº</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                      {formatDate(inv.invoiceDate)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                      {centsToEuros(inv.totalInCents)} €
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[160px]">
                      <span className="truncate block" title={inv.supplierName}>{inv.supplierName || "—"}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {inv.fileId ? (
                        <a
                          href={`/api/files/invoices/${inv.fileId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded border border-input px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors whitespace-nowrap"
                        >
                          📄 Ver
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground/40 italic">Sin PDF</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="space-y-1">
                        <select
                          value={selected}
                          onChange={e => handleSelect(inv.id, e.target.value)}
                          disabled={isPending}
                          className={`w-full rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring ${
                            err ? "border-destructive" : "border-input"
                          }`}
                        >
                          <option value="">— Selecciona proveedor —</option>
                          {suppliers.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        {err && <p className="text-[10px] text-destructive">{err}</p>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => handleReassign(inv.id)}
                        disabled={isPending || !selected}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 whitespace-nowrap"
                      >
                        Reasignar
                      </button>
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
