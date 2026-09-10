/* eslint-disable @typescript-eslint/no-explicit-any */
// ── AÑADIR AL FINAL DE src/modules/hr/actions/schedules.ts ───────────────────
// (mantén las importaciones que ya tienes; sólo añade estas funciones)

// Asegúrate de tener en las importaciones:
//   import { revalidatePath } from "next/cache";
//   import { prisma } from "@/core/db/client";
//   import { requirePermission } from "@/core/auth/session";
//   import type { ScheduleDayInput } from "../types";

// ── Actualizar horario ────────────────────────────────────────────────────────

export async function updateScheduleAction(input: {
  scheduleId: string;
  employeeId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  notes?: string | null;
  isVacation?: boolean;
  days: ScheduleDayInput[];
}): Promise<{ error?: string; success?: boolean }> {
  try {
    await requirePermission("hr:schedules:write");
  } catch {
    return { error: "No tienes permiso para editar horarios." };
  }

  const {
    scheduleId, employeeId, effectiveFrom, effectiveTo,
    notes, isVacation, days,
  } = input;

  if (!scheduleId || !effectiveFrom) {
    return { error: "Faltan campos obligatorios." };
  }

  // Construir notas incluyendo marcador VACACIONES si aplica
  const finalNotes = isVacation
    ? `VACACIONES${notes?.trim() ? `\n${notes.trim()}` : ""}`
    : (notes?.trim() || null);

  try {
    // Eliminar los días actuales y volver a crearlos
    await ((prisma as unknown as Record<string, unknown>)["scheduleDayTemplate"] as any).deleteMany({
      where: { weeklyScheduleId: scheduleId },
    });

    await ((prisma as unknown as Record<string, unknown>)["weeklySchedule"] as any).update({
      where: { id: scheduleId },
      data: {
        effectiveFrom: new Date(effectiveFrom + "T12:00:00"),
        effectiveTo: effectiveTo ? new Date(effectiveTo + "T12:00:00") : null,
        notes: finalNotes,
        days: {
          create: days.map(d => ({
            dayOfWeek: d.dayOfWeek,
            isRestDay: d.isRestDay,
            morningStart: d.isRestDay ? null : (d.morningStart || null),
            morningEnd: d.isRestDay ? null : (d.morningEnd || null),
            afternoonStart: d.isRestDay ? null : (d.afternoonStart || null),
            afternoonEnd: d.isRestDay ? null : (d.afternoonEnd || null),
          })),
        },
      },
    });

    revalidatePath(`/hr/${employeeId}`);
    return { success: true };
  } catch (err) {
    console.error("[updateSchedule]", err);
    return { error: "Error al actualizar el horario. Inténtalo de nuevo." };
  }
}

// ── Eliminar horario ──────────────────────────────────────────────────────────

export async function deleteScheduleAction(
  scheduleId: string,
  employeeId: string
): Promise<{ error?: string; success?: boolean }> {
  try {
    await requirePermission("hr:schedules:write");
  } catch {
    return { error: "No tienes permiso para eliminar horarios." };
  }

  if (!scheduleId) return { error: "ID de horario no válido." };

  try {
    // Los días (ScheduleDayTemplate) se eliminan en cascada si así está configurado en Prisma.
    // Si no, elimínalolos primero:
    await ((prisma as unknown as Record<string, unknown>)["scheduleDayTemplate"] as any).deleteMany({
      where: { weeklyScheduleId: scheduleId },
    });

    await ((prisma as unknown as Record<string, unknown>)["weeklySchedule"] as any).delete({
      where: { id: scheduleId },
    });

    revalidatePath(`/hr/${employeeId}`);
    return { success: true };
  } catch (err) {
    console.error("[deleteSchedule]", err);
    return { error: "Error al eliminar el horario. Inténtalo de nuevo." };
  }
}

// ── Helper para detectar horarios de vacaciones ───────────────────────────────
// Importa y usa esto en los componentes cliente/servidor para identificar vacaciones
export function isVacationSchedule(notes: string | null | undefined): boolean {
  return !!notes?.startsWith("VACACIONES");
}

export function vacationExtraNotes(notes: string | null | undefined): string {
  if (!notes?.startsWith("VACACIONES")) return "";
  return notes.replace(/^VACACIONES\n?/, "").trim();
}
