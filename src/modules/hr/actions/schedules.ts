/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

/**
 * Server Actions — Horarios semanales
 *
 * Los horarios son versionados: se crea una nueva versión por cada cambio.
 * ENCARGADO puede leer horarios (sin datos sensibles del empleado).
 * RRHH/ADMIN pueden crear y leer.
 */
import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";
import { auditLog } from "@/core/audit/AuditService";
import { AUDIT_SCHEDULE_CREATED } from "@/core/audit/events";
import { createScheduleSchema } from "../lib/validators";
import type { WeeklyScheduleRow, ScheduleDayInput } from "../types";
import { weeklyHoursFromDays } from "../lib/scheduleUtils";

// ── Listado de horarios de un empleado ────────────────────────

export async function listSchedules(
  employeeId: string
): Promise<WeeklyScheduleRow[]> {
  await requirePermission("hr:schedules:read");

  const schedules = await ((prisma as unknown as Record<string, unknown>)["weeklySchedule"] as any).findMany({
    where: { employeeId },
    orderBy: { effectiveFrom: "desc" },
    include: {
      days: { orderBy: { dayOfWeek: "asc" } },
      createdBy: { select: { name: true } },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (schedules as any[]).map((s) => ({
    id: s.id,
    employeeId: s.employeeId,
    effectiveFrom: s.effectiveFrom.toISOString().split("T")[0],
    effectiveTo: s.effectiveTo
      ? s.effectiveTo.toISOString().split("T")[0]
      : null,
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
    createdByName: s.createdBy.name,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    days: (s.days as any[]).map((d) => ({
      dayOfWeek: d.dayOfWeek,
      isRestDay: d.isRestDay,
      morningStart: d.morningStart,
      morningEnd: d.morningEnd,
      afternoonStart: d.afternoonStart,
      afternoonEnd: d.afternoonEnd,
    })) as ScheduleDayInput[],
  }));
}

// ── Horario vigente de un empleado ────────────────────────────

export async function getActiveSchedule(
  employeeId: string
): Promise<WeeklyScheduleRow | null> {
  await requirePermission("hr:schedules:read");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const schedule = await ((prisma as unknown as Record<string, unknown>)["weeklySchedule"] as any).findFirst({
    where: {
      employeeId,
      effectiveFrom: { lte: today },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
    },
    orderBy: { effectiveFrom: "desc" },
    include: {
      days: { orderBy: { dayOfWeek: "asc" } },
      createdBy: { select: { name: true } },
    },
  });

  if (!schedule) return null;

  return {
    id: schedule.id,
    employeeId: schedule.employeeId,
    effectiveFrom: schedule.effectiveFrom.toISOString().split("T")[0],
    effectiveTo: schedule.effectiveTo
      ? schedule.effectiveTo.toISOString().split("T")[0]
      : null,
    notes: schedule.notes,
    createdAt: schedule.createdAt.toISOString(),
    createdByName: schedule.createdBy.name,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    days: (schedule.days as any[]).map((d) => ({
      dayOfWeek: d.dayOfWeek,
      isRestDay: d.isRestDay,
      morningStart: d.morningStart,
      morningEnd: d.morningEnd,
      afternoonStart: d.afternoonStart,
      afternoonEnd: d.afternoonEnd,
    })) as ScheduleDayInput[],
  };
}

// ── Horarios de todos los empleados activos (vista ENCARGADO) ─

export async function listAllActiveSchedules(): Promise<
  {
    employeeId: string;
    employeeName: string;
    schedule: WeeklyScheduleRow | null;
  }[]
> {
  await requirePermission("hr:schedules:read");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const employees = await ((prisma as unknown as Record<string, unknown>)["employee"] as any).findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: {
      schedules: {
        where: {
          effectiveFrom: { lte: today },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
        },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
        include: {
          days: { orderBy: { dayOfWeek: "asc" } },
          createdBy: { select: { name: true } },
        },
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (employees as any[]).map((e) => {
    const s = e.schedules[0] ?? null;
    return {
      employeeId: e.id,
      employeeName: `${e.firstName} ${e.lastName}`,
      schedule: s
        ? {
            id: s.id,
            employeeId: s.employeeId,
            effectiveFrom: s.effectiveFrom.toISOString().split("T")[0],
            effectiveTo: s.effectiveTo
              ? s.effectiveTo.toISOString().split("T")[0]
              : null,
            notes: s.notes,
            createdAt: s.createdAt.toISOString(),
            createdByName: s.createdBy.name,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            days: (s.days as any[]).map((d) => ({
              dayOfWeek: d.dayOfWeek,
              isRestDay: d.isRestDay,
              morningStart: d.morningStart,
              morningEnd: d.morningEnd,
              afternoonStart: d.afternoonStart,
              afternoonEnd: d.afternoonEnd,
            })) as ScheduleDayInput[],
          }
        : null,
    };
  });
}

// ── Crear horario ─────────────────────────────────────────────

export type CreateScheduleState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: boolean;
  scheduleId?: string;
};

export async function createScheduleAction(
  _prev: CreateScheduleState,
  formData: FormData
): Promise<CreateScheduleState> {
  let actor: Awaited<ReturnType<typeof requirePermission>>;
  try {
    actor = await requirePermission("hr:schedules:write");
  } catch {
    return { error: "No tienes permiso para crear horarios." };
  }

  // Los días se pasan como JSON serializado en un campo oculto
  const daysRaw = formData.get("days") as string;
  let daysData: unknown;
  try {
    daysData = JSON.parse(daysRaw);
  } catch {
    return { error: "Datos de días inválidos." };
  }

  const raw = {
    employeeId: formData.get("employeeId") as string,
    effectiveFrom: formData.get("effectiveFrom") as string,
    effectiveTo: (formData.get("effectiveTo") as string) || undefined,
    notes: (formData.get("notes") as string) || undefined,
    days: daysData,
  };

  const parsed = createScheduleSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const d = parsed.data;

  // Verificar que el empleado existe
  const employee = await ((prisma as unknown as Record<string, unknown>)["employee"] as any).findUnique({
    where: { id: d.employeeId, deletedAt: null },
    select: { id: true },
  });
  if (!employee) {
    return { error: "Empleado no encontrado." };
  }

  try {
    const schedule = await ((prisma as unknown as Record<string, unknown>)["weeklySchedule"] as any).create({
      data: {
        employeeId: d.employeeId,
        effectiveFrom: new Date(d.effectiveFrom),
        effectiveTo:
          d.effectiveTo && d.effectiveTo !== ""
            ? new Date(d.effectiveTo)
            : null,
        notes: d.notes || null,
        createdById: actor.id,
        days: {
          create: d.days.map((day) => ({
            dayOfWeek: day.dayOfWeek,
            isRestDay: day.isRestDay,
            morningStart: day.morningStart ?? null,
            morningEnd: day.morningEnd ?? null,
            afternoonStart: day.afternoonStart ?? null,
            afternoonEnd: day.afternoonEnd ?? null,
          })),
        },
      },
    });

    const totalHours = weeklyHoursFromDays(d.days);

    await auditLog({
      action: AUDIT_SCHEDULE_CREATED,
      actorId: actor.id,
      targetType: "WeeklySchedule",
      targetId: schedule.id,
      metadata: {
        employeeId: d.employeeId,
        effectiveFrom: d.effectiveFrom,
        totalWeeklyHours: totalHours,
      },
    });

    revalidatePath(`/hr/${d.employeeId}`);
    revalidatePath("/hr/schedules");
    return { success: true, scheduleId: schedule.id };
  } catch (err) {
    console.error("[createSchedule] Error:", err);
    return { error: "Error al crear el horario. Inténtalo de nuevo." };
  }
}

// ── Actualizar horario ────────────────────────────────────────

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

  const { scheduleId, employeeId, effectiveFrom, effectiveTo, notes, isVacation, days } = input;
  if (!scheduleId || !effectiveFrom) return { error: "Faltan campos obligatorios." };

  const finalNotes = isVacation
    ? `VACACIONES${notes?.trim() ? `\n${notes.trim()}` : ""}`
    : (notes?.trim() || null);

  const finalDays = isVacation
    ? [1,2,3,4,5,6,7].map(dow => ({ dayOfWeek: dow, isRestDay: true, morningStart: null, morningEnd: null, afternoonStart: null, afternoonEnd: null }))
    : days;

  try {
    // ScheduleDay tiene onDelete: Cascade, se borran solos al hacer deleteMany
    await ((prisma as unknown as Record<string, unknown>)["scheduleDay"] as any).deleteMany({
      where: { scheduleId },
    });

    await ((prisma as unknown as Record<string, unknown>)["weeklySchedule"] as any).update({
      where: { id: scheduleId },
      data: {
        effectiveFrom: new Date(effectiveFrom + "T12:00:00"),
        effectiveTo: effectiveTo ? new Date(effectiveTo + "T12:00:00") : null,
        notes: finalNotes,
        days: {
          create: finalDays.map(d => ({
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

// ── Eliminar horario ──────────────────────────────────────────

export async function deleteScheduleAction(
  scheduleId: string,
  employeeId: string
): Promise<{ error?: string; success?: boolean }> {
  try {
    await requirePermission("hr:schedules:write");
  } catch {
    return { error: "No tienes permiso para eliminar horarios." };
  }

  try {
    // ScheduleDay borra en cascada (onDelete: Cascade en schema)
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
