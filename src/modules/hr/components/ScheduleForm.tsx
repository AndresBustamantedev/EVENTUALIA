"use client";

import { useActionState, useState } from "react";
import type { CreateScheduleState } from "../actions/schedules";
import { DAY_NAMES } from "../types";
import { defaultWeekDays, weeklyHoursFromDays, formatHours } from "../lib/scheduleUtils";
import type { ScheduleDayInput } from "../types";

interface ScheduleFormProps {
  employeeId: string;
  action: (
    prev: CreateScheduleState,
    formData: FormData
  ) => Promise<CreateScheduleState>;
}

const initialState: CreateScheduleState = {};

const INPUT_CLASS =
  "rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";
const LABEL_CLASS = "block text-sm font-medium mb-1";

export function ScheduleForm({ employeeId, action }: ScheduleFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [days, setDays] = useState<ScheduleDayInput[]>(defaultWeekDays());

  const updateDay = (
    idx: number,
    field: keyof ScheduleDayInput,
    value: unknown
  ) => {
    setDays((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, [field]: value } : d))
    );
  };

  const totalHours = weeklyHoursFromDays(days);

  return (
    <form
      action={(formData) => {
        formData.set("days", JSON.stringify(days));
        return formAction(formData);
      }}
      className="space-y-5"
    >
      <input type="hidden" name="employeeId" value={employeeId} />

      {state.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {state.success && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Horario creado correctamente.
        </div>
      )}

      {/* Fechas de vigencia */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="effectiveFrom" className={LABEL_CLASS}>
            Vigente desde <span className="text-destructive">*</span>
          </label>
          <input
            id="effectiveFrom"
            name="effectiveFrom"
            type="date"
            required
            disabled={isPending || !!state.success}
            className={INPUT_CLASS + " w-full"}
          />
        </div>
        <div>
          <label htmlFor="effectiveTo" className={LABEL_CLASS}>
            Vigente hasta{" "}
            <span className="text-muted-foreground text-xs">(opcional)</span>
          </label>
          <input
            id="effectiveTo"
            name="effectiveTo"
            type="date"
            disabled={isPending || !!state.success}
            className={INPUT_CLASS + " w-full"}
          />
        </div>
      </div>

      {/* Cuadrícula de días */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Día</th>
              <th className="px-3 py-2 text-center font-medium">Descanso</th>
              <th className="px-3 py-2 text-left font-medium">Mañana inicio</th>
              <th className="px-3 py-2 text-left font-medium">Mañana fin</th>
              <th className="px-3 py-2 text-left font-medium">Tarde inicio</th>
              <th className="px-3 py-2 text-left font-medium">Tarde fin</th>
              <th className="px-3 py-2 text-right font-medium">Horas</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {days.map((day, idx) => {
              const isRest = day.isRestDay;
              const h = isRest
                ? "Descanso"
                : (() => {
                    const mins =
                      (day.morningStart && day.morningEnd
                        ? ((t1: string, t2: string) => {
                            const [h1, m1] = t1.split(":").map(Number);
                            const [h2, m2] = t2.split(":").map(Number);
                            const s = h1 * 60 + m1;
                            let e = h2 * 60 + m2;
                            if (e <= s) e += 24 * 60;
                            return e - s;
                          })(day.morningStart, day.morningEnd)
                        : 0) +
                      (day.afternoonStart && day.afternoonEnd
                        ? ((t1: string, t2: string) => {
                            const [h1, m1] = t1.split(":").map(Number);
                            const [h2, m2] = t2.split(":").map(Number);
                            const s = h1 * 60 + m1;
                            let e = h2 * 60 + m2;
                            if (e <= s) e += 24 * 60;
                            return e - s;
                          })(day.afternoonStart, day.afternoonEnd)
                        : 0);
                    return formatHours(mins / 60);
                  })();

              return (
                <tr key={day.dayOfWeek} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">
                    {DAY_NAMES[day.dayOfWeek]}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={isRest}
                      disabled={isPending || !!state.success}
                      onChange={(e) =>
                        updateDay(idx, "isRestDay", e.target.checked)
                      }
                      className="h-4 w-4 rounded border-gray-300 accent-primary"
                    />
                  </td>
                  {(
                    [
                      "morningStart",
                      "morningEnd",
                      "afternoonStart",
                      "afternoonEnd",
                    ] as const
                  ).map((field) => (
                    <td key={field} className="px-3 py-1.5">
                      <input
                        type="time"
                        value={day[field] ?? ""}
                        disabled={isRest || isPending || !!state.success}
                        onChange={(e) =>
                          updateDay(
                            idx,
                            field,
                            e.target.value || null
                          )
                        }
                        className={INPUT_CLASS + " w-28"}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                    {h}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-muted/30 font-medium">
            <tr>
              <td colSpan={6} className="px-3 py-2 text-right">
                Total semanal:
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatHours(totalHours)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div>
        <label htmlFor="scheduleNotes" className={LABEL_CLASS}>
          Notas
        </label>
        <textarea
          id="scheduleNotes"
          name="notes"
          rows={2}
          disabled={isPending || !!state.success}
          className={INPUT_CLASS + " w-full"}
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || !!state.success}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {isPending ? "Guardando…" : "Crear horario"}
        </button>
      </div>
    </form>
  );
}
