"use client";

import { useState, useTransition } from "react";
import { deleteSupplierAction } from "@/modules/suppliers/actions/suppliers";

interface SupplierDeleteButtonProps {
  supplierId: string;
  supplierName: string;
  invoiceCount: number;
  bundleCount: number;
  orderCount: number;
}

export function SupplierDeleteButton({
  supplierId,
  supplierName,
  invoiceCount,
  bundleCount,
  orderCount,
}: SupplierDeleteButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasLinkedRecords = invoiceCount > 0 || bundleCount > 0 || orderCount > 0;

  const blockedReasons: string[] = [];
  if (invoiceCount > 0) blockedReasons.push(`${invoiceCount} factura(s)`);
  if (bundleCount > 0) blockedReasons.push(`${bundleCount} bundle(s)`);
  if (orderCount > 0) blockedReasons.push(`${orderCount} pedido(s)`);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteSupplierAction(supplierId);
      if (result?.error) {
        setError(result.error);
        setShowConfirm(false);
      }
      // On success, deleteSupplierAction calls redirect("/suppliers") — no extra handling needed
    });
  }

  return (
    <div className="mt-6 pt-6 border-t">
      <h2 className="text-base font-semibold mb-2 text-destructive">Zona de peligro</h2>

      {hasLinkedRecords ? (
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm text-muted-foreground">
            No se puede eliminar este proveedor porque tiene registros asociados:{" "}
            <span className="font-medium text-foreground">{blockedReasons.join(", ")}</span>.
            Elimina primero esos registros.
          </p>
          <button
            disabled
            className="mt-3 inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium bg-destructive/30 text-destructive/50 cursor-not-allowed"
          >
            Eliminar proveedor
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          {error && (
            <p className="mb-3 text-sm text-destructive font-medium">{error}</p>
          )}

          {!showConfirm ? (
            <>
              <p className="text-sm text-muted-foreground mb-3">
                Eliminar permanentemente este proveedor. Esta acción no se puede deshacer.
              </p>
              <button
                onClick={() => setShowConfirm(true)}
                className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Eliminar proveedor
              </button>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                ¿Eliminar a <span className="text-destructive">&ldquo;{supplierName}&rdquo;</span>? Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={isPending}
                  className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-60"
                >
                  {isPending ? "Eliminando…" : "Sí, eliminar"}
                </button>
                <button
                  onClick={() => { setShowConfirm(false); setError(null); }}
                  disabled={isPending}
                  className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium border border-border bg-background hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
