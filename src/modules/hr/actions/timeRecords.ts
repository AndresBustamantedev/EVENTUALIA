/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

/**
 * Server Actions — Registro mensual de jornada
 *
 * RBAC:
 *  - hr:records:read  → ADMIN, RRHH
 *  - hr:records:write → ADMIN, RRHH
 *
 * Seguridad:
 *  - No se incluye DNI/NAF en ningún snapshot ni log.
 *  - Los PDFs se guardan con clave opaca (UUID-based), nunca con nombre del empleado.
 *  - El cierre es irreversible sin motivo explícito de reapertura.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";
import { auditLog } from "@/core/audit/AuditService";
import {
  AUDIT_TIME_RECORD_CREATED,
  AUDIT_TIME_RECORD_CLOSED,
  AUDIT_TIME_RECORD_REOPENED,
} from "@/core/audit/events";
import { storeFile } from "@/core/storage/StorageProvider";
import { renderTimeRecordPdf } from "@/core/pdf/timeRecordPdf";
import {
  buildMonthPresets,
  calcDayMinutes,
  sumMinutes,
  formatMonthYear,
} from "../lib/timeRecordUtils";
import type { ScheduleDayInput } from "../types";

// ── Tipos públicos ────────────────────────────────────────────

export interface TimeRecordRow {
  id: string;
  employeeId: string;
  year: number;
  month: number;
  status: "DRAFT" | "CLOSED";
  closedAt: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  createdAt: string;
  createdByName: string;
  totalOrdinaryMinutes: number;
  totalOvertimeMinutes: number;
}

export interface TimeRecordDayRow {
  id: string;
  date: string;           // "YYYY-MM-DD"
  dayType: string;
  morningStart: string | null;
  morningEnd: string | null;
  afternoonStart: string | null;
  afternoonEnd: string | null;
  totalMinutes: number;
  ordinaryMinutes: number;
  overtimeMinutes: number;
  observation: string | null;
}

export interface TimeRecordDetail extends TimeRecordRow {
  days: TimeRecordDayRow[];
  contractSnapshot: Record<string, unknown>;
  scheduleSnapshot: Record<string, unknown>;
  currentPdfKey: string | null;
}

// ── Helpers ───────────────────────────────────────────────────

function mapDay(d: any): TimeRecordDayRow {
  return {
    id: d.id,
    date: d.date.toISOString().split("T")[0],
    dayType: d.dayType,
    morningStart: d.morningStart,
    morningEnd: d.morningEnd,
    afternoonStart: d.afternoonStart,
    afternoonEnd: d.afternoonEnd,
    totalMinutes: d.totalMinutes ?? 0,
    ordinaryMinutes: d.ordinaryMinutes ?? 0,
    overtimeMinutes: d.overtimeMinutes ?? 0,
    observation: d.observation,
  };
}

function mapRecord(r: any): TimeRecordRow {
  const days: any[] = r.days ?? [];
  const { ordinaryMinutes, overtimeMinutes } = sumMinutes(days);
  return {
    id: r.id,
    employeeId: r.employeeId,
    year: r.year,
    month: r.month,
    status: r.status,
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
    reopenedAt: r.reopenedAt ? r.reopenedAt.toISOString() : null,
    reopenReason: r.reopenReason,
    createdAt: r.createdAt.toISOString(),
    createdByName: r.createdBy?.name ?? "",
    totalOrdinaryMinutes: ordinaryMinutes,
    totalOvertimeMinutes: overtimeMinutes,
  };
}

// ── Listado de registros de un empleado ───────────────────────

export async function listTimeRecords(
  employeeId: string
): Promise<TimeRecordRow[]> {
  await requirePermission("hr:records:read");

  const records = await ((prisma as unknown as Record<string, unknown>)["timeRecord"] as any).findMany({
    where: { employeeId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: {
      createdBy: { select: { name: true } },
      days: { select: { ordinaryMinutes: true, overtimeMinutes: true } },
    },
  });

  return (records as any[]).map(mapRecord);
}

// ── Detalle completo de un registro ──────────────────────────

export async function getTimeRecord(recordId: string): Promise<TimeRecordDetail> {
  await requirePermission("hr:records:read");

  const r = await ((prisma as unknown as Record<string, unknown>)["timeRecord"] as any).findUnique({
    where: { id: recordId },
    include: {
      createdBy: { select: { name: true } },
      days: { orderBy: { date: "asc" } },
      pdfs: {
        where: { isCurrent: true },
        orderBy: { generatedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!r) throw new Error("Registro no encontrado");

  const base = mapRecord(r);
  const days: TimeRecordDayRow[] = (r.days as any[]).map(mapDay);
  const { ordinaryMinutes, overtimeMinutes } = sumMinutes(days);

  return {
    ...base,
    days,
    totalOrdinaryMinutes: ordinaryMinutes,
    totalOvertimeMinutes: overtimeMinutes,
    contractSnapshot: r.contractSnapshot as Record<string, unknown>,
    scheduleSnapshot: r.scheduleSnapshot as Record<string, unknown>,
    currentPdfKey: r.pdfs[0]?.storageKey ?? null,
  };
}

// ── Crear borrador de registro ────────────────────────────────

export type CreateTimeRecordState = {
  error?: string;
  success?: boolean;
  recordId?: string;
};

export async function createTimeRecordAction(
  _prev: CreateTimeRecordState,
  formData: FormData
): Promise<CreateTimeRecordState> {
  let actor: Awaited<ReturnType<typeof requirePermission>>;
  try {
    actor = await requirePermission("hr:records:write");
  } catch {
    return { error: "No tienes permiso para crear registros de jornada." };
  }

  const employeeId = formData.get("employeeId") as string;
  const yearRaw = parseInt(formData.get("year") as string, 10);
  const monthRaw = parseInt(formData.get("month") as string, 10);

  if (!employeeId || isNaN(yearRaw) || isNaN(monthRaw) || monthRaw < 1 || monthRaw > 12) {
    return { error: "Datos inválidos." };
  }

  // Verificar que no existe ya un registro para ese mes
  const existing = await ((prisma as unknown as Record<string, unknown>)["timeRecord"] as any).findUnique({
    where: { employeeId_year_month: { employeeId, year: yearRaw, month: monthRaw } },
    select: { id: true },
  });
  if (existing) {
    return { error: `Ya existe un registro para ${formatMonthYear(yearRaw, monthRaw)}.` };
  }

  // Obtener contrato y horario activos en el primer día del mes
  const firstDay = new Date(yearRaw, monthRaw - 1, 1);
  firstDay.setHours(0, 0, 0, 0);

  const contract = await ((prisma as unknown as Record<string, unknown>)["contract"] as any).findFirst({
    where: {
      employeeId,
      startDate: { lte: firstDay },
      OR: [{ endDate: null }, { endDate: { gte: firstDay } }],
    },
    orderBy: { startDate: "desc" },
  });

  // Cargar TODOS los horarios que se solapan con el mes (resolución por día)
  const monthStart = new Date(yearRaw, monthRaw - 1, 1);
  const monthEnd   = new Date(yearRaw, monthRaw, 0);   // último día del mes

  const allSchedules = await ((prisma as unknown as Record<string, unknown>)["weeklySchedule"] as any).findMany({
    where: {
      employeeId,
      effectiveFrom: { lte: monthEnd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthStart } }],
    },
    orderBy: { effectiveFrom: "asc" },
    include: { days: { orderBy: { dayOfWeek: "asc" } } },
  });

  // Horario base para el snapshot: el activo el primer día del mes (o el más reciente antes)
  const schedule = allSchedules
    .filter((s: any) => s.effectiveFrom <= firstDay)
    .at(-1) ?? allSchedules[0] ?? null;

  // Snapshots (sin datos sensibles)
  const contractSnapshot = contract
    ? {
        contractType: contract.contractType,
        startDate: contract.startDate.toISOString().split("T")[0],
        endDate: contract.endDate ? contract.endDate.toISOString().split("T")[0] : null,
        weeklyHours: contract.weeklyHours.toString(),
        monthlyHours: contract.monthlyHours ? contract.monthlyHours.toString() : null,
        isFullTime: contract.isFullTime,
      }
    : {};

  const scheduleDays: ScheduleDayInput[] = schedule
    ? (schedule.days as any[]).map((d: any) => ({
        dayOfWeek: d.dayOfWeek,
        isRestDay: d.isRestDay,
        morningStart: d.morningStart,
        morningEnd: d.morningEnd,
        afternoonStart: d.afternoonStart,
        afternoonEnd: d.afternoonEnd,
      }))
    : [];

  const scheduleSnapshot = schedule
    ? {
        effectiveFrom: schedule.effectiveFrom.toISOString().split("T")[0],
        days: scheduleDays,
      }
    : { days: [] };

  // Construir rangos de horario para resolución por día
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scheduleRanges = (allSchedules as any[]).map((s: any) => ({
    effectiveFrom: s.effectiveFrom.toISOString().split("T")[0],
    effectiveTo: s.effectiveTo ? s.effectiveTo.toISOString().split("T")[0] : null,
    days: (s.days as any[]).map((d: any) => ({
      dayOfWeek: d.dayOfWeek,
      isRestDay: d.isRestDay,
      morningStart: d.morningStart,
      morningEnd: d.morningEnd,
      afternoonStart: d.afternoonStart,
      afternoonEnd: d.afternoonEnd,
    })) as ScheduleDayInput[],
  }));

  // Precargar días del mes con resolución por día
  const presets = buildMonthPresets(yearRaw, monthRaw, scheduleDays, scheduleRanges);

  try {
    const record = await ((prisma as unknown as Record<string, unknown>)["timeRecord"] as any).create({
      data: {
        employeeId,
        year: yearRaw,
        month: monthRaw,
        status: "DRAFT",
        contractSnapshot,
        scheduleSnapshot,
        createdById: actor.id,
        days: {
          create: presets.map((p) => ({
            date: new Date(p.date + "T12:00:00"),
            dayType: p.dayType,
            morningStart: p.morningStart,
            morningEnd: p.morningEnd,
            afternoonStart: p.afternoonStart,
            afternoonEnd: p.afternoonEnd,
            totalMinutes: p.totalMinutes,
            ordinaryMinutes: p.ordinaryMinutes,
            overtimeMinutes: p.overtimeMinutes,
          })),
        },
      },
    });

    await auditLog({
      action: AUDIT_TIME_RECORD_CREATED,
      actorId: actor.id,
      targetType: "TimeRecord",
      targetId: record.id,
      metadata: { employeeId, year: yearRaw, month: monthRaw },
    });

    revalidatePath(`/hr/${employeeId}`);
    return { success: true, recordId: record.id };
  } catch (err) {
    console.error("[createTimeRecord]", err);
    return { error: "Error al crear el registro. Inténtalo de nuevo." };
  }
}

// ── Actualizar un día ─────────────────────────────────────────

export type UpdateDayState = {
  error?: string;
  success?: boolean;
};

export async function updateTimeRecordDayAction(
  _prev: UpdateDayState,
  formData: FormData
): Promise<UpdateDayState> {
  try {
    await requirePermission("hr:records:write");
  } catch {
    return { error: "Sin permiso." };
  }

  const dayId = formData.get("dayId") as string;
  const dayType = formData.get("dayType") as string;
  const morningStart = (formData.get("morningStart") as string) || null;
  const morningEnd = (formData.get("morningEnd") as string) || null;
  const afternoonStart = (formData.get("afternoonStart") as string) || null;
  const afternoonEnd = (formData.get("afternoonEnd") as string) || null;
  const observation = (formData.get("observation") as string) || null;
  const ordinaryMinutesRaw = formData.get("ordinaryMinutes") as string;
  const overtimeMinutesRaw = formData.get("overtimeMinutes") as string;

  if (!dayId || !dayType) return { error: "Datos inválidos." };

  // Verificar que el registro está en DRAFT
  const day = await ((prisma as unknown as Record<string, unknown>)["timeRecordDay"] as any).findUnique({
    where: { id: dayId },
    include: { timeRecord: { select: { id: true, status: true, employeeId: true } } },
  });
  if (!day) return { error: "Día no encontrado." };
  if (day.timeRecord.status !== "DRAFT") {
    return { error: "El registro está cerrado. Reabrirlo antes de editar." };
  }

  const isWorkDay = ["WORK", "HOLIDAY"].includes(dayType);
  const totalMinutes = isWorkDay
    ? calcDayMinutes({ morningStart, morningEnd, afternoonStart, afternoonEnd })
    : 0;

  const ordinaryMinutes = ordinaryMinutesRaw !== ""
    ? parseInt(ordinaryMinutesRaw, 10)
    : (isWorkDay ? totalMinutes : 0);

  const overtimeMinutes = overtimeMinutesRaw !== ""
    ? parseInt(overtimeMinutesRaw, 10)
    : 0;

  try {
    await ((prisma as unknown as Record<string, unknown>)["timeRecordDay"] as any).update({
      where: { id: dayId },
      data: {
        dayType,
        morningStart: isWorkDay ? morningStart : null,
        morningEnd: isWorkDay ? morningEnd : null,
        afternoonStart: isWorkDay ? afternoonStart : null,
        afternoonEnd: isWorkDay ? afternoonEnd : null,
        totalMinutes: isWorkDay ? totalMinutes : 0,
        ordinaryMinutes: isWorkDay ? ordinaryMinutes : 0,
        overtimeMinutes: isWorkDay ? overtimeMinutes : 0,
        observation,
      },
    });

    revalidatePath(`/hr/time-records/${day.timeRecord.id}`);
    return { success: true };
  } catch (err) {
    console.error("[updateDay]", err);
    return { error: "Error al guardar. Inténtalo de nuevo." };
  }
}

// ── Cerrar registro ───────────────────────────────────────────

export async function closeTimeRecordAction(
  recordId: string
): Promise<{ error?: string; success?: boolean }> {
  let actor: Awaited<ReturnType<typeof requirePermission>>;
  try {
    actor = await requirePermission("hr:records:write");
  } catch {
    return { error: "Sin permiso." };
  }

  const record = await ((prisma as unknown as Record<string, unknown>)["timeRecord"] as any).findUnique({
    where: { id: recordId },
    select: { id: true, status: true, employeeId: true, year: true, month: true },
  });
  if (!record) return { error: "Registro no encontrado." };
  if (record.status !== "DRAFT") return { error: "El registro ya está cerrado." };

  await ((prisma as unknown as Record<string, unknown>)["timeRecord"] as any).update({
    where: { id: recordId },
    data: { status: "CLOSED", closedAt: new Date(), closedById: actor.id },
  });

  await auditLog({
    action: AUDIT_TIME_RECORD_CLOSED,
    actorId: actor.id,
    targetType: "TimeRecord",
    targetId: recordId,
    metadata: { employeeId: record.employeeId, year: record.year, month: record.month },
  });

  revalidatePath(`/hr/time-records/${recordId}`);
  revalidatePath(`/hr/${record.employeeId}`);
  return { success: true };
}

// ── Reabrir registro ──────────────────────────────────────────

export async function reopenTimeRecordAction(
  recordId: string,
  reason: string
): Promise<{ error?: string; success?: boolean }> {
  let actor: Awaited<ReturnType<typeof requirePermission>>;
  try {
    actor = await requirePermission("hr:records:write");
  } catch {
    return { error: "Sin permiso." };
  }

  if (!reason || reason.trim().length < 10) {
    return { error: "El motivo de reapertura debe tener al menos 10 caracteres." };
  }

  const record = await ((prisma as unknown as Record<string, unknown>)["timeRecord"] as any).findUnique({
    where: { id: recordId },
    select: { id: true, status: true, employeeId: true, year: true, month: true },
  });
  if (!record) return { error: "Registro no encontrado." };
  if (record.status !== "CLOSED") return { error: "El registro ya está abierto." };

  await ((prisma as unknown as Record<string, unknown>)["timeRecord"] as any).update({
    where: { id: recordId },
    data: {
      status: "DRAFT",
      reopenedAt: new Date(),
      reopenedById: actor.id,
      reopenReason: reason.trim(),
    },
  });

  await auditLog({
    action: AUDIT_TIME_RECORD_REOPENED,
    actorId: actor.id,
    targetType: "TimeRecord",
    targetId: recordId,
    metadata: { employeeId: record.employeeId, year: record.year, month: record.month },
  });

  revalidatePath(`/hr/time-records/${recordId}`);
  revalidatePath(`/hr/${record.employeeId}`);
  return { success: true };
}

// ── Generar PDF ───────────────────────────────────────────────

export async function generateTimeRecordPdfAction(
  recordId: string
): Promise<{ error?: string; success?: boolean; storageKey?: string }> {
  let actor: Awaited<ReturnType<typeof requirePermission>>;
  try {
    actor = await requirePermission("hr:records:write");
  } catch {
    return { error: "Sin permiso." };
  }

  const record = await ((prisma as unknown as Record<string, unknown>)["timeRecord"] as any).findUnique({
    where: { id: recordId },
    include: {
      employee: { select: { firstName: true, lastName: true } },
      days: { orderBy: { date: "asc" } },
      pdfs: { where: { isCurrent: true }, select: { id: true } },
    },
  });
  if (!record) return { error: "Registro no encontrado." };

  // Leer configuración de empresa (con fallback)
  const settings = await ((prisma as unknown as Record<string, unknown>)["appSetting"] as any).findMany({
    where: { key: { in: ["company.name", "company.cif", "company.signatureName"] } },
  });
  const settingMap: Record<string, string> = {};
  for (const s of settings as any[]) settingMap[s.key] = s.value;

  const contractSnap = record.contractSnapshot as Record<string, unknown>;

  const days = (record.days as any[]).map((d: any) => ({
    date: d.date.toISOString().split("T")[0],
    dayType: d.dayType as string,
    morningStart: d.morningStart,
    morningEnd: d.morningEnd,
    afternoonStart: d.afternoonStart,
    afternoonEnd: d.afternoonEnd,
    totalMinutes: d.totalMinutes ?? 0,
    ordinaryMinutes: d.ordinaryMinutes ?? 0,
    overtimeMinutes: d.overtimeMinutes ?? 0,
    observation: d.observation,
  }));

  const { ordinaryMinutes, overtimeMinutes } = sumMinutes(days);

  const pdfData = {
    companyName: settingMap["company.name"] ?? "Cruz Blanca Coimbra",
    companyCif: settingMap["company.cif"] ?? "B88119391",
    signatureCompanyName: settingMap["company.signatureName"] ?? "Eventualia Central de Servicios 17 S.L",
    employeeName: `${record.employee.firstName} ${record.employee.lastName}`,
    year: record.year,
    month: record.month,
    contractType: (contractSnap.contractType as string) ?? "—",
    weeklyHours: (contractSnap.weeklyHours as string) ?? "—",
    days,
    totalOrdinaryMinutes: ordinaryMinutes,
    totalOvertimeMinutes: overtimeMinutes,
  };

  try {
    const pdfBuffer = await renderTimeRecordPdf(pdfData);

    // Nombre opaco: no incluye nombre del empleado
    const filename = `jornada_${record.year}_${String(record.month).padStart(2, "0")}_${recordId.slice(0, 8)}.pdf`;
    const stored = await storeFile("pdfs/jornada", filename, pdfBuffer);

    // Marcar anteriores como no-current
    if ((record.pdfs as any[]).length > 0) {
      await ((prisma as unknown as Record<string, unknown>)["timeRecordPdf"] as any).updateMany({
        where: { timeRecordId: recordId, isCurrent: true },
        data: { isCurrent: false },
      });
    }

    // Obtener version number
    const count = await ((prisma as unknown as Record<string, unknown>)["timeRecordPdf"] as any).count({
      where: { timeRecordId: recordId },
    });

    await ((prisma as unknown as Record<string, unknown>)["timeRecordPdf"] as any).create({
      data: {
        timeRecordId: recordId,
        version: count + 1,
        storageKey: stored.storageKey,
        sizeBytes: stored.sizeBytes,
        isCurrent: true,
        generatedById: actor.id,
      },
    });

    revalidatePath(`/hr/time-records/${recordId}`);
    return { success: true, storageKey: stored.storageKey };
  } catch (err) {
    console.error("[generatePdf]", err);
    return { error: "Error al generar el PDF. Inténtalo de nuevo." };
  }
}

// ── Eliminar registro de jornada ──────────────────────────────
// Solo se permite eliminar registros en estado DRAFT.

export async function deleteTimeRecordAction(
  recordId: string
): Promise<{ error?: string; success?: boolean }> {
  try {
    await requirePermission("hr:records:write");
  } catch {
    return { error: "No tienes permiso para eliminar registros de jornada." };
  }

  const record = await ((prisma as unknown as Record<string, unknown>)["timeRecord"] as any).findUnique({
    where: { id: recordId },
    select: { id: true, status: true, employeeId: true },
  });

  if (!record) return { error: "Registro no encontrado." };
  if (record.status === "CLOSED") {
    return { error: "El registro está cerrado. Reabrirlo antes de eliminarlo." };
  }

  try {
    await ((prisma as unknown as Record<string, unknown>)["timeRecordDay"] as any).deleteMany({
      where: { timeRecordId: recordId },
    });
    await ((prisma as unknown as Record<string, unknown>)["timeRecordPdf"] as any).deleteMany({
      where: { timeRecordId: recordId },
    });
    await ((prisma as unknown as Record<string, unknown>)["timeRecord"] as any).delete({
      where: { id: recordId },
    });
    revalidatePath(`/hr/${record.employeeId}`);
    return { success: true };
  } catch (err) {
    console.error("[deleteTimeRecord]", err);
    return { error: "Error al eliminar el registro. Inténtalo de nuevo." };
  }
}
