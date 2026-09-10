"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteBundleAction } from "@/modules/suppliers/actions/bundles";

interface Props {
  bundleId:     string;
  invoiceCount: number;
  description:  string | null;
}

export function BundleDeleteButton({ bundleId, invoiceCount, description }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    const result = await deleteBundleAction(bundleId);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      setConfirming(false);
      return;
    }
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-destructive font-medium">
          ¿Eliminar{description ? ` "${description}"` : " este escáner"}
          {invoiceCount > 0 ? ` y sus ${invoiceCount} factura${invoiceCount !== 1 ? "s" : ""}` : ""}?
        </span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className="rounded px-2 py-0.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 font-medium"
        >
          {loading ? "Eliminando…" : "Sí, eliminar"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="text-muted-foreground hover:underline"
        >
          Cancelar
        </button>
        {error && <span className="text-destructive">{error}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-xs text-destructive/60 hover:text-destructive hover:underline"
    >
      Eliminar escáner
    </button>
  );
}
