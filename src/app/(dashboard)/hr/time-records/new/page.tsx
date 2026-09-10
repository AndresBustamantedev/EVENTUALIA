/**
 * Página: Crear nuevo registro de jornada
 * Acceso: ADMIN, RRHH (hr:records:write)
 *
 * Recibe ?employeeId= por query string.
 * Muestra un formulario con selector de mes/año para un empleado.
 */
"use client";

import { useActionState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createTimeRecordAction } from "@/modules/hr/actions/timeRecords";
import { MONTH_NAMES_ES } from "@/modules/hr/lib/timeRecordUtils";

const INITIAL_STATE = { error: undefined, success: undefined };

export default function NewTimeRecordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const employeeId = searchParams.get("employeeId") ?? "";

  const [state, formAction, isPending] = useActionState(
    createTimeRecordAction,
    INITIAL_STATE
  );

  // Redirect on success (en useEffect para no llamar router.push durante el render)
  useEffect(() => {
    if (state.recordId) {
      router.push(`/hr/time-records/${state.recordId}`);
    }
  }, [state.recordId, router]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 3 + i); // 3 años atrás + 2 adelante
  const months = MONTH_NAMES_ES.slice(1); // indices 1-12

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={employeeId ? `/hr/${employeeId}?tab=jornada` : "/hr"}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Volver
        </Link>
        <h1 className="text-xl font-semibold">Nuevo registro de jornada</h1>
      </div>

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="employeeId" value={employeeId} />

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="year">
            Año
          </label>
          <select
            id="year"
            name="year"
            defaultValue={currentYear}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="month">
            Mes
          </label>
          <select
            id="month"
            name="month"
            defaultValue={new Date().getMonth() + 1}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {months.map((m, i) => (
              <option key={i + 1} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {state.error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || !employeeId}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Creando…" : "Crear registro"}
        </button>

        {!employeeId && (
          <p className="text-xs text-muted-foreground">
            Falta el ID de empleado. Accede desde el perfil del empleado.
          </p>
        )}
      </form>
    </div>
  );
}
