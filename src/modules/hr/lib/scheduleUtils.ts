/**
 * Utilidades para cálculo de horas en horarios
 *
 * Soporta tramos que cruzan medianoche (p.ej. 22:00–02:00).
 * Todas las funciones trabajan con strings "HH:MM" para evitar
 * problemas de zona horaria — los horarios son locales al negocio.
 */

/** Convierte "HH:MM" a minutos desde medianoche. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Convierte minutos a "HH:MM" (puede superar 24h para cruce de medianoche). */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Calcula los minutos de un tramo horario.
 * Si end < start se asume cruce de medianoche (se suman 24h al end).
 */
export function trampMinutes(start: string, end: string): number {
  const startMin = timeToMinutes(start);
  let endMin = timeToMinutes(end);
  if (endMin <= startMin) {
    // Cruce de medianoche
    endMin += 24 * 60;
  }
  return endMin - startMin;
}

export interface DaySchedule {
  isRestDay: boolean;
  morningStart?: string | null;
  morningEnd?: string | null;
  afternoonStart?: string | null;
  afternoonEnd?: string | null;
}

/**
 * Calcula las horas trabajadas en un día.
 * Devuelve 0 para días de descanso o sin tramos definidos.
 */
export function dayHours(day: DaySchedule): number {
  if (day.isRestDay) return 0;

  let total = 0;

  if (day.morningStart && day.morningEnd) {
    total += trampMinutes(day.morningStart, day.morningEnd);
  }

  if (day.afternoonStart && day.afternoonEnd) {
    total += trampMinutes(day.afternoonStart, day.afternoonEnd);
  }

  return total / 60;
}

/**
 * Calcula el total de horas semanales sumando todos los días.
 */
export function weeklyHoursFromDays(days: DaySchedule[]): number {
  return days.reduce((acc, day) => acc + dayHours(day), 0);
}

/**
 * Formatea horas decimales a "X h YY min".
 * Ejemplo: 7.5 → "7 h 30 min"
 */
export function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

/**
 * Determina si un tramo cruza medianoche.
 */
export function crossesMidnight(start: string, end: string): boolean {
  return timeToMinutes(end) <= timeToMinutes(start);
}

/**
 * Genera los 7 días de la semana con todos en descanso como plantilla.
 */
export function defaultWeekDays() {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i + 1,
    isRestDay: true,
    morningStart: null,
    morningEnd: null,
    afternoonStart: null,
    afternoonEnd: null,
  }));
}
