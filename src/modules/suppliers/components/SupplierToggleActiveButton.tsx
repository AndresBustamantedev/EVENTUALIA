"use client";

import { useState, useTransition } from "react";
import { toggleSupplierActiveAction } from "@/modules/suppliers/actions/suppliers";

interface Props {
  supplierId:      string;
  supplierName:    string;
  initialIsActive: boolean;
}

export function SupplierToggleActiveButton({ supplierId, supplierName, initialIsActive }: Props) {
  const [isActive, setIsActive]      = useState(initialIsActive);
  const [error, setError]            = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      const result = await toggleSupplierActiveAction(supplierId);
      if (result.error) {
        setError(result.error);
      } else {
        setIsActive(result.isActive);
      }
    });
  }

  return (
    <div className="border-t pt-6 mt-2">
      <h2 className="text-base font-semibold mb-1">
        {isActive ? "Desactivar proveedor" : "Activar proveedor"}
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        {isActive
          ? `"${supplierName}" dejará de aparecer en las listas activas. Sus facturas y datos se conservan. Se reactiva automáticamente si llega una factura reciente.`
          : `"${supplierName}" volverá a aparecer en las listas activas.`}
      </p>

      {error && (
        <p className="text-sm text-destructive mb-3">{error}</p>
      )}

      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
          isActive
            ? "border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20"
            : "border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
        }`}
      >
        {isPending
          ? "Guardando…"
          : isActive
            ? "⏸ Marcar como inactivo"
            : "▶ Marcar como activo"}
      </button>
    </div>
  );
}
