/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

/**
 * Server Actions — Contratos
 *
 * Los contratos son versiones inmutables: nunca se editan,
 * solo se añaden nuevas versiones. El historial siempre se conserva.
 */
import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";
import { auditLog } from "@/core/audit/AuditService";
import { AUDIT_CONTRACT_CREATED } from "@/core/audit/events";
import { createContractSchema } from "../lib/validators";
import type { ContractRow, ContractType } from "../types";

// ── Listado de contratos de un empleado ───────────────────────

export async function listContracts(employeeId: string): Promise<ContractRow[]> {
  await requirePermission("hr:contracts:read");

  const contracts = await ((prisma as unknown as Record<string, unknown>)["contract"] as any).findMany({
    where: { employeeId },
    orderBy: { startDate: "desc" },
    include: {
      createdBy: { select: { name: true } },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (contracts as any[]).map((c) => ({
    id: c.id,
    employeeId: c.employeeId,
    contractType: c.contractType as ContractType,
    startDate: c.startDate.toISOString().split("T")[0],
    endDate: c.endDate ? c.endDate.toISOString().split("T")[0] : null,
    weeklyHours: c.weeklyHours.toString(),
    monthlyHours: c.monthlyHours ? c.monthlyHours.toString() : null,
    isFullTime: c.isFullTime,
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
    createdByName: c.createdBy.name,
  }));
}

// ── Crear nueva versión de contrato ───────────────────────────

export type CreateContractState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: boolean;
  contractId?: string;
};

export async function createContractAction(
  _prev: CreateContractState,
  formData: FormData
): Promise<CreateContractState> {
  let actor: Awaited<ReturnType<typeof requirePermission>>;
  try {
    actor = await requirePermission("hr:contracts:write");
  } catch {
    return { error: "No tienes permiso para crear contratos." };
  }

  const weeklyHoursRaw = formData.get("weeklyHours") as string;
  const monthlyHoursRaw = formData.get("monthlyHours") as string;

  const raw = {
    employeeId: formData.get("employeeId") as string,
    contractType: formData.get("contractType") as string,
    startDate: formData.get("startDate") as string,
    endDate: (formData.get("endDate") as string) || undefined,
    weeklyHours: weeklyHoursRaw ? parseFloat(weeklyHoursRaw) : NaN,
    monthlyHours:
      monthlyHoursRaw && monthlyHoursRaw !== ""
        ? parseFloat(monthlyHoursRaw)
        : undefined,
    isFullTime: formData.get("isFullTime") === "true",
    notes: (formData.get("notes") as string) || undefined,
  };

  const parsed = createContractSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const d = parsed.data;

  // Verificar que el empleado existe y está activo
  const employee = await ((prisma as unknown as Record<string, unknown>)["employee"] as any).findUnique({
    where: { id: d.employeeId, deletedAt: null },
    select: { id: true },
  });
  if (!employee) {
    return { error: "Empleado no encontrado." };
  }

  try {
    const contract = await ((prisma as unknown as Record<string, unknown>)["contract"] as any).create({
      data: {
        employeeId: d.employeeId,
        contractType: d.contractType,
        startDate: new Date(d.startDate),
        endDate: d.endDate && d.endDate !== "" ? new Date(d.endDate) : null,
        weeklyHours: d.weeklyHours,
        monthlyHours: d.monthlyHours ?? null,
        isFullTime: d.isFullTime,
        notes: d.notes || null,
        createdById: actor.id,
      },
    });

    await auditLog({
      action: AUDIT_CONTRACT_CREATED,
      actorId: actor.id,
      targetType: "Contract",
      targetId: contract.id,
      metadata: {
        employeeId: d.employeeId,
        contractType: d.contractType,
        startDate: d.startDate,
        weeklyHours: d.weeklyHours,
      },
    });

    revalidatePath(`/hr/${d.employeeId}`);
    return { success: true, contractId: contract.id };
  } catch (err) {
    console.error("[createContract] Error:", err);
    return { error: "Error al crear el contrato. Inténtalo de nuevo." };
  }
}

// ── Contrato activo de un empleado ────────────────────────────

export async function getActiveContract(
  employeeId: string
): Promise<ContractRow | null> {
  await requirePermission("hr:contracts:read");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const contract = await ((prisma as unknown as Record<string, unknown>)["contract"] as any).findFirst({
    where: {
      employeeId,
      startDate: { lte: today },
      OR: [{ endDate: null }, { endDate: { gte: today } }],
    },
    orderBy: { startDate: "desc" },
    include: {
      createdBy: { select: { name: true } },
    },
  });

  if (!contract) return null;

  return {
    id: contract.id,
    employeeId: contract.employeeId,
    contractType: contract.contractType as ContractType,
    startDate: contract.startDate.toISOString().split("T")[0],
    endDate: contract.endDate
      ? contract.endDate.toISOString().split("T")[0]
      : null,
    weeklyHours: contract.weeklyHours.toString(),
    monthlyHours: contract.monthlyHours
      ? contract.monthlyHours.toString()
      : null,
    isFullTime: contract.isFullTime,
    notes: contract.notes,
    createdAt: contract.createdAt.toISOString(),
    createdByName: contract.createdBy.name,
  };
}

// ── Actualizar contrato ───────────────────────────────────────

export async function updateContractAction(input: {
  contractId: string;
  employeeId: string;
  contractType: ContractType;
  startDate: string;
  endDate?: string | null;
  weeklyHours: number;
  monthlyHours?: number | null;
  isFullTime: boolean;
  notes?: string | null;
}): Promise<{ error?: string; success?: boolean }> {
  try {
    await requirePermission("hr:contracts:write");
  } catch {
    return { error: "No tienes permiso para editar contratos." };
  }

  const { contractId, employeeId, contractType, startDate, endDate, weeklyHours, monthlyHours, isFullTime, notes } = input;
  if (!contractId || !startDate || !contractType || !weeklyHours) {
    return { error: "Faltan campos obligatorios." };
  }

  try {
    await ((prisma as unknown as Record<string, unknown>)["contract"] as any).update({
      where: { id: contractId },
      data: {
        contractType,
        startDate: new Date(startDate + "T12:00:00"),
        endDate: endDate ? new Date(endDate + "T12:00:00") : null,
        weeklyHours,
        monthlyHours: monthlyHours ?? null,
        isFullTime,
        notes: notes?.trim() || null,
      },
    });
    revalidatePath(`/hr/${employeeId}`);
    return { success: true };
  } catch (err) {
    console.error("[updateContract]", err);
    return { error: "Error al actualizar el contrato. Inténtalo de nuevo." };
  }
}

// ── Eliminar contrato ─────────────────────────────────────────

export async function deleteContractAction(
  contractId: string,
  employeeId: string
): Promise<{ error?: string; success?: boolean }> {
  try {
    await requirePermission("hr:contracts:write");
  } catch {
    return { error: "No tienes permiso para eliminar contratos." };
  }

  try {
    await ((prisma as unknown as Record<string, unknown>)["contract"] as any).delete({
      where: { id: contractId },
    });
    revalidatePath(`/hr/${employeeId}`);
    return { success: true };
  } catch (err) {
    console.error("[deleteContract]", err);
    return { error: "Error al eliminar el contrato. Inténtalo de nuevo." };
  }
}
