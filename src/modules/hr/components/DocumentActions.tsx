"use client";

/**
 * Botones de acción para un documento individual:
 * - Borrar (soft delete) / Restaurar
 * - Cambiar estado PENDING ↔ SIGNED
 *
 * Usa useTransition para no bloquear la UI y router.refresh() al completar.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  softDeleteDocumentAction,
  restoreDocumentAction,
  updateDocumentStatusAction,
} from "@/modules/hr/actions/employeeDocuments";

interface Props {
  docId: string;
  status: string;      // "PENDING" | "SIGNED"
  isDeleted: boolean;
}

export function DocumentActions({ docId, status, isDeleted }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm("¿Enviar este documento a la papelera?")) return;
    startTransition(async () => {
      const r = await softDeleteDocumentAction(docId);
      if (r.error) alert(r.error);
      else router.refresh();
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const r = await restoreDocumentAction(docId);
      if (r.error) alert(r.error);
      else router.refresh();
    });
  }

  function handleToggleStatus() {
    const next = status === "PENDING" ? "SIGNED" : "PENDING";
    const label = next === "SIGNED" ? "Firmado" : "Pendiente";
    if (!confirm(`¿Cambiar estado a "${label}"?`)) return;
    startTransition(async () => {
      const r = await updateDocumentStatusAction(docId, next);
      if (r.error) alert(r.error);
      else router.refresh();
    });
  }

  if (isDeleted) {
    return (
      <button
        onClick={handleRestore}
        disabled={pending}
        className="text-xs text-blue-600 hover:underline disabled:opacity-50"
      >
        Restaurar
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleToggleStatus}
        disabled={pending}
        className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        {status === "PENDING" ? "Marcar firmado" : "Marcar pendiente"}
      </button>
      <button
        onClick={handleDelete}
        disabled={pending}
        className="text-xs text-destructive hover:underline disabled:opacity-50"
      >
        Borrar
      </button>
    </div>
  );
}
