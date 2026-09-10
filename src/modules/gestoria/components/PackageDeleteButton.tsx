"use client";

import { useState, useTransition } from "react";
import { deletePackageAction } from "@/modules/gestoria/actions/packages";

interface Props {
  packageId: string;
  packageLabel: string; // e.g. "1er trimestre 2025"
  itemCount:   number;
}

export function PackageDeleteButton({ packageId, packageLabel, itemCount }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deletePackageAction(packageId);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
      }
      // On success, revalidatePath in action triggers a re-render
    });
  }

  if (confirming) {
    return (
      <div
        className="flex items-center gap-2"
        onClick={e => e.preventDefault()}
      >
        <span className="text-xs text-destructive font-medium">
          {itemCount > 0
            ? `¿Eliminar paquete con ${itemCount} factura${itemCount !== 1 ? "s" : ""}?`
            : "¿Eliminar este paquete?"}
        </span>
        <button
          type="button"
          disabled={isPending}
          onClick={handleDelete}
          className="rounded px-2 py-0.5 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
        >
          {isPending ? "Eliminando…" : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => { setConfirming(false); setError(null); }}
          className="rounded px-2 py-0.5 text-xs border hover:bg-muted"
        >
          Cancelar
        </button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={e => { e.preventDefault(); setConfirming(true); }}
      title={`Eliminar ${packageLabel}`}
      className="shrink-0 rounded p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
      aria-label="Eliminar paquete"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6l-1 14H6L5 6"></path>
        <path d="M10 11v6"></path><path d="M14 11v6"></path>
        <path d="M9 6V4h6v2"></path>
      </svg>
    </button>
  );
}
