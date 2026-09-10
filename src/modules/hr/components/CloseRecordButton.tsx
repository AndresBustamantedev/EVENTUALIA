"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeTimeRecordAction } from "@/modules/hr/actions/timeRecords";

export function CloseRecordButton({ recordId }: { recordId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClose() {
    if (
      !confirm(
        "¿Cerrar este registro? Una vez cerrado no podrás editarlo sin indicar un motivo de reapertura."
      )
    )
      return;
    startTransition(async () => {
      const result = await closeTimeRecordAction(recordId);
      if (result.error) {
        alert(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <button
      onClick={handleClose}
      disabled={isPending}
      className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
    >
      {isPending ? "Cerrando…" : "Cerrar registro"}
    </button>
  );
}
