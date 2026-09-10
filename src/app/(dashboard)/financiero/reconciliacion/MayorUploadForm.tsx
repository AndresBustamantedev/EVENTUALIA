"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { uploadMayorAction, type MayorUploadState } from "@/modules/gestoria/actions/reconciliation";

interface Props {
  suppliers: { id: string; name: string }[];
  defaultSupplierId?: string;
  defaultYear?: number;
  defaultQuarter?: number;
  onSuccess?: () => void;
}

const QUARTERS = [
  { value: "1", label: "1er trimestre (Ene–Mar)" },
  { value: "2", label: "2º trimestre (Abr–Jun)" },
  { value: "3", label: "3er trimestre (Jul–Sep)" },
  { value: "4", label: "4º trimestre (Oct–Dic)" },
];

const currentYear = new Date().getFullYear();
const YEARS = [currentYear - 1, currentYear, currentYear + 1];

const initial: MayorUploadState = {};

export default function MayorUploadForm({
  suppliers,
  defaultSupplierId,
  defaultYear,
  defaultQuarter,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(uploadMayorAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success && state.mayorId) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.success, state.mayorId, router]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          Mayor subido y analizado correctamente.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Proveedor */}
        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-foreground mb-1">
            Proveedor <span className="text-destructive">*</span>
          </label>
          <select
            name="supplierId"
            required
            defaultValue={defaultSupplierId ?? ""}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— Selecciona proveedor —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Año */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Año <span className="text-destructive">*</span>
          </label>
          <select
            name="year"
            required
            defaultValue={String(defaultYear ?? currentYear)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {YEARS.map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>

        {/* Trimestre */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Trimestre <span className="text-destructive">*</span>
          </label>
          <select
            name="quarter"
            required
            defaultValue={String(defaultQuarter ?? Math.ceil((new Date().getMonth() + 1) / 3))}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {QUARTERS.map((q) => (
              <option key={q.value} value={q.value}>{q.label}</option>
            ))}
          </select>
        </div>

        {/* Archivo */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Archivo (PDF o imagen) <span className="text-destructive">*</span>
          </label>
          <input
            type="file"
            name="file"
            required
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Notas */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Notas internas</label>
        <input
          type="text"
          name="notes"
          placeholder="Ej. Mayor recibido por email el 10/01"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Procesando con IA…" : "Subir y analizar"}
        </button>
      </div>
    </form>
  );
}
