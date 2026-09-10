"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateTimeRecordPdfAction } from "@/modules/hr/actions/timeRecords";

export function GeneratePdfButton({ recordId }: { recordId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateTimeRecordPdfAction(recordId);
      if (result.error) {
        alert(result.error);
      } else {
        // Abrir el PDF en nueva pestaña automáticamente
        if (result.storageKey) {
          window.open(
            `/api/files/time-records/${encodeURIComponent(result.storageKey)}`,
            "_blank",
            "noopener,noreferrer"
          );
        }
        router.refresh();
      }
    });
  }

  return (
    <button
      onClick={handleGenerate}
      disabled={isPending}
      className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted transition-colors disabled:opacity-50"
    >
      {isPending ? "Generando PDF…" : "Generar PDF"}
    </button>
  );
}
