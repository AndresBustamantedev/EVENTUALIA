"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTimeRecordAction } from "@/modules/hr/actions/timeRecords";

interface Props { recordId: string; status: "DRAFT" | "CLOSED"; }

export function TimeRecordDeleteButton({ recordId, status }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (status === "CLOSED") return (
    <span className="text-xs text-muted-foreground/50" title="Reabre el registro para poder eliminarlo">—</span>
  );

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTimeRecordAction(recordId);
      if (result.error) { alert(result.error); setConfirming(false); }
      else router.refresh();
    });
  }

  if (confirming) return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="text-destructive font-medium">¿Eliminar?</span>
      <button type="button" onClick={handleDelete} disabled={isPending}
        className="text-destructive hover:underline disabled:opacity-50">{isPending ? "…" : "Sí"}</button>
      <button type="button" onClick={() => setConfirming(false)}
        className="text-muted-foreground hover:underline">No</button>
    </span>
  );

  return (
    <button type="button" onClick={() => setConfirming(true)}
      className="text-xs text-destructive hover:underline">Eliminar</button>
  );
}
