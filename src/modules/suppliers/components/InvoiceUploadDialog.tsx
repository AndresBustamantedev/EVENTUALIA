"use client";

import { useActionState, useRef, useState, useEffect } from "react";
import { uploadInvoiceAction } from "@/modules/suppliers/actions/invoices";
import type { SupplierRow } from "@/modules/suppliers/types";

interface Props {
  suppliers: SupplierRow[];
  defaultSupplierId?: string;
  onClose: () => void;
}

const INIT = { error: undefined, success: false };

export function InvoiceUploadDialog({ suppliers, defaultSupplierId, onClose }: Props) {
  const [state, formAction, pending] = useActionState(uploadInvoiceAction, INIT);
  const [forceCreate, setForceCreate] = useState(false);
  const isDuplicate = state.error?.startsWith("DUPLICATE:");
  const errorMsg = isDuplicate ? state.error!.replace("DUPLICATE:", "") : state.error;
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) { onClose(); }
  }, [state.success, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card rounded-xl border shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-base">Subir factura</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
        </div>

        <form ref={formRef} action={formAction} className="p-5 space-y-4">
          {forceCreate && <input type="hidden" name="forceCreate" value="true" />}

          {/* Proveedor */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Proveedor *</label>
            {defaultSupplierId ? (
              <>
                <input type="hidden" name="supplierId" value={defaultSupplierId} />
                <p className="text-sm font-medium py-1.5">
                  {suppliers.find(s => s.id === defaultSupplierId)?.name ?? "—"}
                </p>
              </>
            ) : (
              <select name="supplierId" required className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                <option value="">Seleccionar proveedor…</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>

          {/* Fecha */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fecha de factura *</label>
            <input type="date" name="invoiceDate" required className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
          </div>

          {/* Número de factura */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nº de factura</label>
            <input type="text" name="invoiceNumber" placeholder="FVC26001234" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
          </div>

          {/* Importe */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Importe total (€)</label>
            <input type="text" name="totalEuros" placeholder="0,00" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
          </div>

          {/* Archivo */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Documento (PDF o imagen)</label>
            <input type="file" name="file" accept=".pdf,image/*" className="w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:font-medium" />
          </div>

          {/* Error / duplicado */}
          {errorMsg && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {errorMsg}
              {isDuplicate && (
                <button type="button" onClick={() => setForceCreate(true)} className="mt-2 block underline text-xs font-medium">
                  Sí, registrar igualmente
                </button>
              )}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={pending} className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-60">
              {pending ? "Guardando…" : "Guardar factura"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
