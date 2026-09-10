"use client";
import { useState, useTransition } from "react";
import { updateContractAction } from "@/modules/hr/actions/contracts";
import { CONTRACT_TYPES, CONTRACT_TYPE_LABELS } from "@/modules/hr/types";
import type { ContractRow, ContractType } from "@/modules/hr/types";

interface Props { contract: ContractRow; onClose: () => void; onSuccess?: () => void; }

export function ContractEditModal({ contract, onClose, onSuccess }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [fields, setFields] = useState({
    contractType: contract.contractType,
    startDate:    contract.startDate,
    endDate:      contract.endDate ?? "",
    weeklyHours:  contract.weeklyHours,
    monthlyHours: contract.monthlyHours ?? "",
    isFullTime:   contract.isFullTime,
    notes:        contract.notes ?? "",
  });

  function set<K extends keyof typeof fields>(key: K, value: typeof fields[K]) {
    setFields(prev => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateContractAction({
        contractId:   contract.id,
        employeeId:   contract.employeeId,
        contractType: fields.contractType as ContractType,
        startDate:    fields.startDate,
        endDate:      fields.endDate || null,
        weeklyHours:  parseFloat(fields.weeklyHours) || 0,
        monthlyHours: fields.monthlyHours ? parseFloat(fields.monthlyHours) : null,
        isFullTime:   fields.isFullTime,
        notes:        fields.notes || null,
      });
      if (result.error) setError(result.error);
      else { onSuccess?.(); onClose(); }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card rounded-xl border shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h2 className="font-semibold text-base">Editar contrato</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <p className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">{error}</p>}

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Tipo de contrato *</label>
            <select value={fields.contractType} onChange={e => set("contractType", e.target.value)} required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {CONTRACT_TYPES.map(t => <option key={t} value={t}>{CONTRACT_TYPE_LABELS[t]}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Fecha inicio *</label>
              <input type="date" value={fields.startDate} onChange={e => set("startDate", e.target.value)} required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Fecha fin</label>
              <input type="date" value={fields.endDate} onChange={e => set("endDate", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Horas semanales *</label>
              <input type="number" step="0.5" min="0" max="40" value={fields.weeklyHours}
                onChange={e => set("weeklyHours", e.target.value)} required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Horas mensuales</label>
              <input type="number" step="0.5" min="0" value={fields.monthlyHours}
                onChange={e => set("monthlyHours", e.target.value)} placeholder="Opcional"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={fields.isFullTime} onChange={e => set("isFullTime", e.target.checked)} className="rounded" />
            Jornada completa
          </label>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Notas</label>
            <textarea value={fields.notes} onChange={e => set("notes", e.target.value)} rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={isPending}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {isPending ? "Guardando…" : "Guardar cambios"}
            </button>
            <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
