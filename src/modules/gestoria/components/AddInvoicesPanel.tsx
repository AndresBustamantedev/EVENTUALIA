"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addInvoicesToPackageAction } from "@/modules/gestoria/actions/packages";
import type { CandidateInvoice } from "@/modules/gestoria/types";

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

interface Props {
  packageId:  string;
  candidates: CandidateInvoice[];
  onClose:    () => void;
}

export function AddInvoicesPanel({ packageId, candidates, onClose }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === candidates.length
        ? new Set()
        : new Set(candidates.map((c) => c.id))
    );
  }

  function handleAdd() {
    if (selected.size === 0) { setError("Selecciona al menos una factura."); return; }
    setError(null);
    startTransition(async () => {
      const res = await addInvoicesToPackageAction(packageId, [...selected]);
      if (res.error) { setError(res.error); return; }
      router.refresh();
      onClose();
    });
  }

  // Agrupar por proveedor
  const bySupplier = candidates.reduce<Record<string, CandidateInvoice[]>>((acc, c) => {
    (acc[c.supplierName] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-t-2xl sm:rounded-2xl bg-background p-6 shadow-xl max-h-[85vh] flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Añadir facturas al paquete</h2>
          <button type="button" onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
        </div>

        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No hay facturas del trimestre sin asignar a ningún paquete.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <button type="button" onClick={toggleAll} className="hover:underline">
                {selected.size === candidates.length ? "Deseleccionar todas" : "Seleccionar todas"}
              </button>
              <span>{selected.size} de {candidates.length} seleccionadas</span>
            </div>

            <div className="overflow-y-auto flex-1 space-y-4 pr-1">
              {Object.entries(bySupplier).map(([supplierName, invs]) => (
                <div key={supplierName}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    {supplierName}
                  </p>
                  <div className="divide-y rounded-lg border">
                    {invs.map((inv) => (
                      <label key={inv.id}
                        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30">
                        <input type="checkbox" checked={selected.has(inv.id)}
                          onChange={() => toggle(inv.id)} className="h-4 w-4 accent-primary" />
                        <span className="flex-1 min-w-0">
                          <span className="text-sm font-medium">
                            {inv.invoiceNumber ?? "Sin nº"}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2">{inv.invoiceDate}</span>
                          {inv.isPaid && (
                            <span className="ml-2 text-xs text-green-600 dark:text-green-400">pagada</span>
                          )}
                        </span>
                        <span className="text-sm font-mono shrink-0">{formatEuros(inv.totalInCents)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3 pt-2 border-t">
          <button type="button" onClick={handleAdd}
            disabled={isPending || selected.size === 0}
            className="rounded-md bg-primary px-5 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {isPending ? "Añadiendo…" : `Añadir ${selected.size > 0 ? selected.size : ""} factura${selected.size !== 1 ? "s" : ""}`}
          </button>
          <button type="button" onClick={onClose} disabled={isPending}
            className="rounded-md border px-5 py-2 text-sm hover:bg-muted disabled:opacity-60">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
