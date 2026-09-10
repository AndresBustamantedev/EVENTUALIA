import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatea una fecha en zona horaria Europe/Madrid.
 */
export function formatDateMadrid(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-ES", {
    timeZone: "Europe/Madrid",
    ...options,
  });
}

/**
 * Formatea un importe en céntimos como string en euros.
 * Ejemplo: 1250 → "12,50 €"
 */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
  });
}
