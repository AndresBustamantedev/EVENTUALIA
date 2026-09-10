/* eslint-disable @typescript-eslint/no-explicit-any */
// ── AÑADIR AL FINAL DE src/modules/hr/actions/contracts.ts ───────────────────
// (mantén las importaciones que ya tienes; sólo añade estas funciones)

// Asegúrate de tener en las importaciones del archivo:
//   import { revalidatePath } from "next/cache";
//   import { prisma } from "@/core/db/client";
//   import { requirePermission } from "@/core/auth/session";
//   import type { ContractRow, ContractType } from "../types";

// ── Actualizar contrato ───────────────────────────────────────────────────────

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

  const {
    contractId, employeeId, contractType, startDate,
    endDate, weeklyHours, monthlyHours, isFullTime, notes,
  } = input;

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

// ── Eliminar contrato ─────────────────────────────────────────────────────────

export async function deleteContractAction(
  contractId: string,
  employeeId: string
): Promise<{ error?: string; success?: boolean }> {
  try {
    await requirePermission("hr:contracts:write");
  } catch {
    return { error: "No tienes permiso para eliminar contratos." };
  }

  if (!contractId) return { error: "ID de contrato no válido." };

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

// ── Re-exporta tipos necesarios para los componentes cliente ──────────────────
// (ya deberían estar exportados desde types.ts — sólo como referencia)
//  export type { ContractType, ContractRow, CONTRACT_TYPES, CONTRACT_TYPE_LABELS }
