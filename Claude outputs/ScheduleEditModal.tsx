"use client";

/**
 * Modal para editar un horario semanal.
 * Incluye opción VACACIONES.
 * Ruta: src/modules/hr/components/ScheduleEditModal.tsx
 */
import { useState, useTransition } from "react";
import { updateScheduleAction } from "@/modules/hr/actions/schedules";
import { DAY_NAMES } from "@/modules/hr/types";
import type { WeeklyScheduleRow, ScheduleDayInput } from "@/modules/hr/types";

interface Props {
  schedule: WeeklyScheduleRow;
  onClose: () => void;
  onSuccess?: () => void;
}

const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 7];

function isVacationNotes(notes: string | null): boolean {
  return !!notes?.startsWith("VACACIONES");
}

function parseExtraNotes(notes: string | null): string {
  if (!notes?.startsWith("VACACIONES")) return notes ?? "";
  return notes.replace(/^VACACIONES\n?/, "").trim();
}

export function ScheduleEditModal({ schedule, onClose, onSuccess }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [effectiveFrom, setEffectiveFrom] = useState(schedule.effectiveFrom);
  const [effectiveTo, setEffectiveTo] = useState(schedule.effectiveTo ?? "");
  const [isVacation, setIsVacation] = useState(isVacationNotes(schedule.notes));
  const [notes, setNotes] = useState(parseExtraNotes(schedule.notes));

  // Inicializar días: si el horario no tiene los 7 días, rellenar con descanso
  const initDays = (): ScheduleDayInput[] => {
    return DAYS_ORDER.map(dow => {
      const existing = schedule.days.find(d => d.dayOfWeek === dow);
      return existing ?? {
        dayOfWeek: dow,
        isRestDay: true,
        morningStart: null,
        morningEnd: null,
        afternoonStart: null,
        afternoonEnd: null,
      };
    });
  };

  const [days, setDays] = useState<ScheduleDayInput[]>(initDays);

  function updateDay(dow: number, patch: Partial<ScheduleDayInput>) {
    setDays(prev => prev.map(d => d.dayOfWeek === dow ? { ...d, ...patch } : d));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateScheduleAction({
        scheduleId:   schedule.id,
        employeeId:   schedule.employeeId,
        effectiveFrom,
        effectiveTo:  effectiveTo || null,
        notes:        notes || null,
        isVacation,
        days: isVacation
          ? DAYS_ORDER.map(dow => ({ dayOfWeek: dow, isRestDay: true, morningStart: null, morningEnd: null, afternoonStart: null, afternoonEnd: null }))
          : days,
      });
      if (result.error) {
        setError(result.error);
      } else {
        onSuccess?.();
        onClose();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card rounded-xl border shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h2 className="font-semibold text-base">Editar horario</h2>
          <button type="button" onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <p className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {/* Fechas de vigencia */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Vigente desde *</label>
              <input
                type="date"
                value={effectiveFrom}
                onChange={e => setEffectiveFrom(e.target.value)}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Vigente hasta</label>
              <input
                type="date"
                value={effectiveTo}
                onChange={e => setEffectiveTo(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Opción VACACIONES */}
          <label className="flex items-center gap-2.5 text-sm cursor-pointer rounded-lg border border-dashed px-4 py-3 hover:bg-muted/30 transition-colors">
            <input
              type="checkbox"
              checked={isVacation}
              onChange={e => setIsVacation(e.target.checked)}
              className="rounded accent-amber-500 w-4 h-4"
            />
            <span>
              <span className="font-medium">Este período es de VACACIONES</span>
              <span className="text-muted-foreground text-xs block">No se configuran turnos; todos los días quedan como descanso.</span>
            </span>
          </label>

          {/* Tabla de días — sólo si NO es vacaciones */}
          {!isVacation && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Turnos por día</p>
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-xs min-w-[520px]">
                  <thead className="bg-muted/40 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Día</th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground">Descanso</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Mañana</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tarde</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {days.map(d => (
                      <tr key={d.dayOfWeek} className={d.isRestDay ? "opacity-50" : ""}>
                        <td className="px-3 py-2 font-medium">{DAY_NAMES[d.dayOfWeek]}</td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={d.isRestDay}
                            onChange={e => updateDay(d.dayOfWeek, {
                              isRestDay: e.target.checked,
                              morningStart: e.target.checked ? null : d.morningStart,
                              morningEnd: e.target.checked ? null : d.morningEnd,
                              afternoonStart: e.target.checked ? null : d.afternoonStart,
                              afternoonEnd: e.target.checked ? null : d.afternoonEnd,
                            })}
                            className="rounded"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="time"
                              value={d.morningStart ?? ""}
                              disabled={d.isRestDay}
                              onChange={e => updateDay(d.dayOfWeek, { morningStart: e.target.value || null })}
                              className="w-24 rounded border border-input bg-background px-2 py-1 text-xs disabled:opacity-40"
                            />
                            <span className="text-muted-foreground">–</span>
                            <input
                              type="time"
                              value={d.morningEnd ?? ""}
                              disabled={d.isRestDay}
                              onChange={e => updateDay(d.dayOfWeek, { morningEnd: e.target.value || null })}
                              className="w-24 rounded border border-input bg-background px-2 py-1 text-xs disabled:opacity-40"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="time"
                              value={d.afternoonStart ?? ""}
                              disabled={d.isRestDay}
                              onChange={e => updateDay(d.dayOfWeek, { afternoonStart: e.target.value || null })}
                              className="w-24 rounded border border-input bg-background px-2 py-1 text-xs disabled:opacity-40"
                            />
                            <span className="text-muted-foreground">–</span>
                            <input
                              type="time"
                              value={d.afternoonEnd ?? ""}
                              disabled={d.isRestDay}
                              onChange={e => updateDay(d.dayOfWeek, { afternoonEnd: e.target.value || null })}
                              className="w-24 rounded border border-input bg-background px-2 py-1 text-xs disabled:opacity-40"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Notas */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Notas adicionales</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Guardando…" : "Guardar cambios"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
