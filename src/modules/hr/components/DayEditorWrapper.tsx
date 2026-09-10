"use client";

/**
 * DayEditorWrapper — fila de la tabla de jornada con edición inline.
 *
 * Si isDraft=true muestra un botón "Editar" que abre un formulario inline.
 * Si isDraft=false muestra los datos en modo solo lectura.
 */

import { useActionState, useEffect, useState } from "react";
import { updateTimeRecordDayAction } from "@/modules/hr/actions/timeRecords";
import type { TimeRecordDayRow } from "@/modules/hr/actions/timeRecords";
import { DAY_TYPE_LABELS } from "@/modules/hr/lib/timeRecordUtils";
import type { DayTypeValue } from "@/modules/hr/lib/timeRecordUtils";

interface Props {
  day: TimeRecordDayRow;
  recordId: string;
  isDraft: boolean;
}

const DAY_TYPES: DayTypeValue[] = [
  "WORK",
  "REST",
  "HOLIDAY",
  "ABSENCE",
  "VACATION",
  "SICK_LEAVE",
];

const WEEK_LETTERS = ["D", "L", "M", "X", "J", "V", "S"];

function weekdayLetter(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return WEEK_LETTERS[d.getDay()];
}

function minutesToHM(minutes: number): string {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const INITIAL_STATE = { error: undefined, success: false };

export function DayEditorWrapper({ day, recordId, isDraft }: Props) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState(
    updateTimeRecordDayAction,
    INITIAL_STATE
  );

  // Close editor on success (useEffect prevents immediate re-close on re-open)
  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state.success]);

  const isWork = day.dayType === "WORK";

  if (!isDraft || !editing) {
    return (
      <tr className={isWork ? "" : "bg-muted/20 text-muted-foreground"}>
        <td className="px-3 py-1.5 tabular-nums text-xs">
          {day.date.slice(5).replace("-", "/")}
        </td>
        <td className="px-3 py-1.5 text-xs">{weekdayLetter(day.date)}</td>
        <td className="px-3 py-1.5 text-xs">
          {DAY_TYPE_LABELS[day.dayType as DayTypeValue] ?? day.dayType}
        </td>
        <td className="px-3 py-1.5 text-xs tabular-nums">
          {day.morningStart && day.morningEnd
            ? `${day.morningStart}–${day.morningEnd}`
            : "—"}
        </td>
        <td className="px-3 py-1.5 text-xs tabular-nums">
          {day.afternoonStart && day.afternoonEnd
            ? `${day.afternoonStart}–${day.afternoonEnd}`
            : "—"}
        </td>
        <td className="px-3 py-1.5 text-xs tabular-nums text-right">
          {minutesToHM(day.totalMinutes)}
        </td>
        <td className="px-3 py-1.5 text-xs tabular-nums text-right">
          {minutesToHM(day.ordinaryMinutes)}
        </td>
        <td className="px-3 py-1.5 text-xs tabular-nums text-right">
          {day.overtimeMinutes > 0 ? minutesToHM(day.overtimeMinutes) : "—"}
        </td>
        <td className="px-3 py-1.5 text-xs text-muted-foreground">
          {day.observation ?? ""}
        </td>
        {isDraft && (
          <td className="px-2 py-1">
            <button
              onClick={() => setEditing(true)}
              className="rounded px-2 py-0.5 text-xs border border-input hover:bg-muted transition-colors"
            >
              Editar
            </button>
          </td>
        )}
      </tr>
    );
  }

  // Editing mode — inline form spanning all columns
  return (
    <tr>
      <td colSpan={isDraft ? 10 : 9} className="px-3 py-3">
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="dayId" value={day.id} />
          <input type="hidden" name="recordId" value={recordId} />

          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
            <span>{day.date.slice(5).replace("-", "/")} ({weekdayLetter(day.date)})</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Tipo de día */}
            <div className="space-y-1">
              <label className="text-xs font-medium">Tipo</label>
              <select
                name="dayType"
                defaultValue={day.dayType}
                className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {DAY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DAY_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            {/* Mañana inicio */}
            <div className="space-y-1">
              <label className="text-xs font-medium">Mañana inicio</label>
              <input
                type="time"
                name="morningStart"
                defaultValue={day.morningStart ?? ""}
                className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Mañana fin */}
            <div className="space-y-1">
              <label className="text-xs font-medium">Mañana fin</label>
              <input
                type="time"
                name="morningEnd"
                defaultValue={day.morningEnd ?? ""}
                className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Tarde inicio */}
            <div className="space-y-1">
              <label className="text-xs font-medium">Tarde/Noche inicio</label>
              <input
                type="time"
                name="afternoonStart"
                defaultValue={day.afternoonStart ?? ""}
                className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Tarde fin */}
            <div className="space-y-1">
              <label className="text-xs font-medium">Tarde/Noche fin</label>
              <input
                type="time"
                name="afternoonEnd"
                defaultValue={day.afternoonEnd ?? ""}
                className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Horas ordinarias override */}
            <div className="space-y-1">
              <label className="text-xs font-medium">H. Ordinarias (min)</label>
              <input
                type="number"
                name="ordinaryMinutes"
                min={0}
                defaultValue={day.ordinaryMinutes}
                className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Horas extras */}
            <div className="space-y-1">
              <label className="text-xs font-medium">H. Extras (min)</label>
              <input
                type="number"
                name="overtimeMinutes"
                min={0}
                defaultValue={day.overtimeMinutes}
                className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Observación */}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium">Observación</label>
              <input
                type="text"
                name="observation"
                maxLength={200}
                defaultValue={day.observation ?? ""}
                placeholder="Opcional"
                className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {state.error && (
            <p className="text-xs text-destructive">{state.error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded px-3 py-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded px-3 py-1 text-xs border border-input hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}
