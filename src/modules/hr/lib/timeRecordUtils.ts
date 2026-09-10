/**
 * Utilidades para el módulo de registro de jornada.
 *
 * - Cálculo de minutos por día (reutiliza trampMinutes de scheduleUtils)
 * - Precarga de días desde el horario habitual
 * - Helpers de formato de fecha
 */
import { trampMinutes } from "./scheduleUtils";
import type { ScheduleDayInput } from "../types";

// ── Tipos locales ─────────────────────────────────────────────

export type DayTypeValue =
  | "WORK"
  | "REST"
  | "HOLIDAY"
  | "ABSENCE"
  | "VACATION"
  | "SICK_LEAVE";

export interface DayPreset {
  date: string;           // "YYYY-MM-DD"
  dayType: DayTypeValue;
  morningStart: string | null;
  morningEnd: string | null;
  afternoonStart: string | null;
  afternoonEnd: string | null;
  totalMinutes: number;
  ordinaryMinutes: number;
  overtimeMinutes: number;
}

// ── Cálculo de minutos ────────────────────────────────────────

/**
 * Calcula los minutos trabajados en un día con hasta dos tramos.
 * Soporta cruce de medianoche (fin < inicio).
 */
export function calcDayMinutes(day: {
  morningStart?: string | null;
  morningEnd?: string | null;
  afternoonStart?: string | null;
  afternoonEnd?: string | null;
}): number {
  let total = 0;
  if (day.morningStart && day.morningEnd) {
    total += trampMinutes(day.morningStart, day.morningEnd);
  }
  if (day.afternoonStart && day.afternoonEnd) {
    total += trampMinutes(day.afternoonStart, day.afternoonEnd);
  }
  return total;
}

// ── Precarga desde horario ────────────────────────────────────

export interface ScheduleRange {
  effectiveFrom: string;   // "YYYY-MM-DD"
  effectiveTo: string | null;
  days: ScheduleDayInput[];
}

/**
 * Genera los DayPreset para todos los días de un mes dado.
 * Si se pasan scheduleRanges aplica resolución por día (varios horarios en el mes).
 * Si no, usa scheduleDays como horario único para todo el mes.
 *
 * @param year           Año (p.ej. 2026)
 * @param month          Mes 1-12
 * @param scheduleDays   Horario de fallback (snapshot base)
 * @param scheduleRanges Todos los horarios solapados con el mes (opcional)
 */
export function buildMonthPresets(
  year: number,
  month: number,
  scheduleDays: ScheduleDayInput[],
  scheduleRanges?: ScheduleRange[]
): DayPreset[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const result: DayPreset[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    // Date en ISO "YYYY-MM-DD"
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

    // Día de semana ISO: 1=lunes … 7=domingo
    const jsDay = new Date(`${dateStr}T12:00:00`).getDay(); // 0=dom, 1=lun…
    const isoDay = jsDay === 0 ? 7 : jsDay;

    // Seleccionar horario activo ese día (el más reciente cuyo rango lo cubre)
    let activeDays = scheduleDays;
    if (scheduleRanges && scheduleRanges.length > 0) {
      const active = scheduleRanges
        .filter(r => r.effectiveFrom <= dateStr && (!r.effectiveTo || r.effectiveTo >= dateStr))
        .at(-1); // ordenados por effectiveFrom asc → el último es el más reciente
      if (active) activeDays = active.days;
    }

    const sched = activeDays.find((s) => s.dayOfWeek === isoDay);

    if (!sched || sched.isRestDay) {
      result.push({
        date: dateStr,
        dayType: "REST",
        morningStart: null,
        morningEnd: null,
        afternoonStart: null,
        afternoonEnd: null,
        totalMinutes: 0,
        ordinaryMinutes: 0,
        overtimeMinutes: 0,
      });
    } else {
      const ms = sched.morningStart ?? null;
      const me = sched.morningEnd ?? null;
      const as_ = sched.afternoonStart ?? null;
      const ae = sched.afternoonEnd ?? null;
      const total = calcDayMinutes({
        morningStart: ms,
        morningEnd: me,
        afternoonStart: as_,
        afternoonEnd: ae,
      });
      result.push({
        date: dateStr,
        dayType: "WORK",
        morningStart: ms,
        morningEnd: me,
        afternoonStart: as_,
        afternoonEnd: ae,
        totalMinutes: total,
        ordinaryMinutes: total,
        overtimeMinutes: 0,
      });
    }
  }

  return result;
}

// ── Totales ───────────────────────────────────────────────────

export function sumMinutes(
  days: { ordinaryMinutes: number | null; overtimeMinutes: number | null }[]
): { ordinaryMinutes: number; overtimeMinutes: number } {
  return days.reduce<{ ordinaryMinutes: number; overtimeMinutes: number }>(
    (acc, d) => ({
      ordinaryMinutes: acc.ordinaryMinutes + (d.ordinaryMinutes ?? 0),
      overtimeMinutes: acc.overtimeMinutes + (d.overtimeMinutes ?? 0),
    }),
    { ordinaryMinutes: 0, overtimeMinutes: 0 }
  );
}

// ── Nombres de mes ────────────────────────────────────────────

export const MONTH_NAMES_ES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function formatMonthYear(year: number, month: number): string {
  return `${MONTH_NAMES_ES[month] ?? month} ${year}`;
}

export const DAY_TYPE_LABELS: Record<DayTypeValue, string> = {
  WORK:       "Trabajo",
  REST:       "Descanso",
  HOLIDAY:    "Festivo",
  ABSENCE:    "Ausencia",
  VACATION:   "Vacaciones",
  SICK_LEAVE: "Baja médica",
};
