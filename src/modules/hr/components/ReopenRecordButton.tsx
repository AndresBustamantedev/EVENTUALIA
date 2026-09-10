"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reopenTimeRecordAction } from "@/modules/hr/actions/timeRecords";

export function ReopenRecordButton({ recordId }: { recordId: string }) {
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleReopen() {
    if (reason.trim().length < 10) {
      setError("El motivo debe tener al menos 10 caracteres.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await reopenTimeRecordAction(recordId, reason.trim());
      if (result.error) {
        setError(result.error);
      } else {
        setShowForm(false);
        router.refresh();
      }
    });
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted transition-colors"
      >
        Reabrir
      </button>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <div className="space-y-1">
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo de reapertura (mín. 10 caracteres)"
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-ring"
          minLength={10}
          maxLength={300}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <button
        onClick={handleReopen}
        disabled={isPending}
        className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Reabriendo…" : "Confirmar"}
      </button>
      <button
        onClick={() => { setShowForm(false); setError(null); }}
        className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted transition-colors"
      >
        Cancelar
      </button>
    </div>
  );
}
