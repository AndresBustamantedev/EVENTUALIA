"use client";

/**
 * Botón de eliminación permanente de empleado.
 * Solo visible para ADMIN. Muestra confirmación inline antes de ejecutar.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteEmployeePermanentlyAction } from "@/modules/hr/actions/employees";

interface Props {
  employeeId: string;
  employeeName: string;
}

export function DeleteEmployeeButton({ employeeId, employeeName }: Props) {
  const [step, setStep] = useState<"idle" | "confirm">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    setError(null);
    startTransition(() => {
      void deleteEmployeePermanentlyAction(employeeId).then((result) => {
        if (result.error) {
          setError(result.error);
          setStep("idle");
        } else {
          router.push("/hr");
        }
      });
    });
  }

  if (step === "idle") {
    return (
      <button
        type="button"
        onClick={() => setStep("confirm")}
        className="rounded-md border border-destructive/50 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
      >
        Eliminar
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="rounded-md border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm max-w-xs text-right">
        <p className="font-medium text-destructive mb-1">¿Eliminar permanentemente?</p>
        <p className="text-muted-foreground text-xs mb-3">
          Se borrarán todos los datos de{" "}
          <span className="font-medium text-foreground">{employeeName}</span>:
          contratos, horarios, jornadas y documentos. Esta acción no se puede deshacer.
        </p>
        {error && (
          <p className="text-destructive text-xs mb-2">{error}</p>
        )}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => { setStep("idle"); setError(null); }}
            disabled={isPending}
            className="rounded px-3 py-1 text-xs border border-input hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="rounded px-3 py-1 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            {isPending ? "Eliminando…" : "Sí, eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
