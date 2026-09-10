/**
 * Utilidades del módulo Menú del día.
 */
export const DISH_CATEGORY_LABELS: Record<string, string> = {
  FIRST:  "Primer plato",
  SECOND: "Segundo plato",
  OTHER:  "Otro",
};
export const DAILY_MENU_STATUS_LABELS: Record<string, string> = {
  DRAFT:  "Borrador",
  ACTIVE: "Activo",
};
export const DISH_CATEGORIES = ["FIRST", "SECOND", "OTHER"] as const;
export type DishCategory = (typeof DISH_CATEGORIES)[number];

export function formatPrice(cents: number): string {
  const euros = Math.floor(cents / 100);
  const centsPart = Math.abs(cents % 100).toString().padStart(2, "0");
  return `${euros},${centsPart} €`;
}
export function parsePriceToCents(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  const n = parseFloat(normalized);
  if (isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
}
export function formatMenuDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Europe/Madrid" });
}
export function formatMenuDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const weekday = d.toLocaleDateString("es-ES", { weekday: "long", timeZone: "Europe/Madrid" });
  const day = d.getDate();
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${day}/${month}/${year}`;
}
export function toLocalDateString(date: Date): string {
  return date.toLocaleDateString("es-ES", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Madrid" }).split("/").reverse().join("-");
}
