"use client";

/**
 * Botón de borrado suave de factura con confirmación inline.
 */
import { useState, useTransition } from "react";
import { deleteInvoiceAction } from "@/modules/suppliers/actions/invoices";

interface Props {
  invoiceId: string;
  invoiceNumber: string | null;
  onDeleted?: () => void;
}

export function InvoiceDeleteButton({ invoiceId, invoiceNumber, onDeleted }: Props) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteInvoiceAction(invoiceId);
      if (result.error) {
        setError(result.error);
        setConfirm(false);
      } else {
        onDeleted?.();
      }
    });
  }

  if (error) {
    return <span className="text-xs text-destructive">{error}</span>;
  }

  if (confirm) {
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">¿Eliminar{invoiceNumber ? ` Fac. ${invoiceNumber}` : ""}?</span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="text-destructive hover:underline font-medium disabled:opacity-50"
        >
          {isPending ? "…" : "Sí"}
        </button>
        <button
          type="button"
          onClick={() => setConfirm(false)}
          className="text-muted-foreground hover:underline"
        >
          No
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirm(true)}
      className="text-xs text-destructive/70 hover:text-destructive hover:underline"
      title="Eliminar factura"
    >
      Eliminar
    </button>
  );
}
