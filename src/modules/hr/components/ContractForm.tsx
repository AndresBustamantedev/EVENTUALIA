"use client";

import { useActionState } from "react";
import type { CreateContractState } from "../actions/contracts";
import { CONTRACT_TYPES, CONTRACT_TYPE_LABELS } from "../types";

interface ContractFormProps {
  employeeId: string;
  action: (
    prev: CreateContractState,
    formData: FormData
  ) => Promise<CreateContractState>;
}

const initialState: CreateContractState = {};

const INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";
const LABEL_CLASS = "block text-sm font-medium mb-1";
const ERROR_CLASS = "mt-1 text-xs text-destructive";

export function ContractForm({
  employeeId,
  action,
}: ContractFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const fe = state.fieldErrors ?? {};
  const fieldError = (field: string) =>
    fe[field]?.[0] ? <p className={ERROR_CLASS}>{fe[field][0]}</p> : null;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="employeeId" value={employeeId} />

      {state.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {state.success && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Contrato creado correctamente.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="contractType" className={LABEL_CLASS}>
            Tipo de contrato <span className="text-destructive">*</span>
          </label>
          <select
            id="contractType"
            name="contractType"
            disabled={isPending || !!state.success}
            className={INPUT_CLASS}
          >
            {CONTRACT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONTRACT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {fieldError("contractType")}
        </div>

        <div>
          <label htmlFor="isFullTime" className={LABEL_CLASS}>
            Jornada
          </label>
          <select
            id="isFullTime"
            name="isFullTime"
            disabled={isPending || !!state.success}
            className={INPUT_CLASS}
          >
            <option value="true">Completa</option>
            <option value="false">Parcial</option>
          </select>
        </div>

        <div>
          <label htmlFor="startDate" className={LABEL_CLASS}>
            Fecha de inicio <span className="text-destructive">*</span>
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            required
            disabled={isPending || !!state.success}
            className={INPUT_CLASS}
          />
          {fieldError("startDate")}
        </div>

        <div>
          <label htmlFor="endDate" className={LABEL_CLASS}>
            Fecha de fin{" "}
            <span className="text-muted-foreground text-xs">(opcional)</span>
          </label>
          <input
            id="endDate"
            name="endDate"
            type="date"
            disabled={isPending || !!state.success}
            className={INPUT_CLASS}
          />
          {fieldError("endDate")}
        </div>

        <div>
          <label htmlFor="weeklyHours" className={LABEL_CLASS}>
            Horas semanales <span className="text-destructive">*</span>
          </label>
          <input
            id="weeklyHours"
            name="weeklyHours"
            type="number"
            step="0.5"
            min="1"
            max="168"
            required
            disabled={isPending || !!state.success}
            placeholder="40"
            className={INPUT_CLASS}
          />
          {fieldError("weeklyHours")}
        </div>

        <div>
          <label htmlFor="monthlyHours" className={LABEL_CLASS}>
            Horas mensuales{" "}
            <span className="text-muted-foreground text-xs">(opcional)</span>
          </label>
          <input
            id="monthlyHours"
            name="monthlyHours"
            type="number"
            step="0.5"
            min="1"
            max="744"
            disabled={isPending || !!state.success}
            className={INPUT_CLASS}
          />
          {fieldError("monthlyHours")}
        </div>
      </div>

      <div>
        <label htmlFor="contractNotes" className={LABEL_CLASS}>
          Notas
        </label>
        <textarea
          id="contractNotes"
          name="notes"
          rows={2}
          disabled={isPending || !!state.success}
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || !!state.success}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {isPending ? "Guardando…" : "Añadir contrato"}
        </button>
      </div>
    </form>
  );
}
