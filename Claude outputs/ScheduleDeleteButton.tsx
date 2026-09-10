"use client";

/**
 * Botón de eliminar un horario semanal con confirmación.
 * Ruta: src/modules/hr/components/ScheduleDeleteButton.tsx
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteScheduleAction } from "@/modules/hr/actions/schedules";

interface Props {
  scheduleId: string;
  employeeId: string;
}

export function ScheduleDeleteButton({ scheduleId, employeeId }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteScheduleAction(scheduleId, employeeId);
      if (result.error) {
        alert(result.error);
        setConfirming(false);
      } else {
        router.refresh();
      }
    });
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <span className="text-destructive font-medium">¿Eliminar?</span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="text-destructive hover:underline disabled:opacity-50"
        >
          {isPending ? "…" : "Sí"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
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
      onClick={() => setConfirming(true)}
      className="text-xs text-destructive hover:underline"
    >
      Eliminar
    </button>
  );
}
