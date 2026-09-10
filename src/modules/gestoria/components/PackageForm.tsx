"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPackageAction } from "@/modules/gestoria/actions/packages";
import { QUARTER_LABELS } from "@/modules/gestoria/types";

const INPUT_CLASS = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";
const LABEL_CLASS = "block text-sm font-medium mb-1";

interface Props {
  onCancel: () => void;
}

const currentYear = new Date().getFullYear();
const YEARS = [currentYear - 1, currentYear, currentYear + 1];

export function PackageForm({ onCancel }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createPackageAction, {});

  useEffect(() => {
    if (state.success && state.packageId) {
      router.push(`/gestoria/${state.packageId}`);
    }
  }, [state.success, state.packageId, router]);

  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="year" className={LABEL_CLASS}>Año <span className="text-destructive">*</span></label>
          <select id="year" name="year" required disabled={isPending} className={INPUT_CLASS}
            defaultValue={currentYear}>
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {fe.year?.[0] && <p className="mt-1 text-xs text-destructive">{fe.year[0]}</p>}
        </div>

        <div>
          <label htmlFor="quarter" className={LABEL_CLASS}>Trimestre <span className="text-destructive">*</span></label>
          <select id="quarter" name="quarter" required disabled={isPending} className={INPUT_CLASS}>
            {[1, 2, 3, 4].map((q) => (
              <option key={q} value={q}>{QUARTER_LABELS[q]}</option>
            ))}
          </select>
          {fe.quarter?.[0] && <p className="mt-1 text-xs text-destructive">{fe.quarter[0]}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="description" className={LABEL_CLASS}>Descripción (opcional)</label>
        <input id="description" name="description" type="text" disabled={isPending}
          className={INPUT_CLASS} placeholder="ej: Facturas 1T 2026 para gestoría" />
      </div>

      <div>
        <label htmlFor="notes" className={LABEL_CLASS}>Notas internas</label>
        <textarea id="notes" name="notes" rows={2} disabled={isPending}
          className={INPUT_CLASS} />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={isPending}
          className="rounded-md bg-primary px-5 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          {isPending ? "Creando…" : "Crear paquete"}
        </button>
        <button type="button" onClick={onCancel} disabled={isPending}
          className="rounded-md border px-5 py-2 text-sm hover:bg-muted disabled:opacity-60">
          Cancelar
        </button>
      </div>
    </form>
  );
}
