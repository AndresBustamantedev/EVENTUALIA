/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

/**
 * Server Actions — Empleados
 *
 * Seguridad:
 * - Requiere sesión y permiso hr:employees:write para mutaciones.
 * - Requiere hr:employees:read para lecturas.
 * - Cifra campos sensibles antes de persistir.
 * - No loguea DNI, NAF ni teléfono en auditoría.
 */
import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";
import { auditLog } from "@/core/audit/AuditService";
import {
  AUDIT_EMPLOYEE_CREATED,
  AUDIT_EMPLOYEE_UPDATED,
  AUDIT_EMPLOYEE_ARCHIVED,
  AUDIT_EMPLOYEE_DATA_ACCESSED,
} from "@/core/audit/events";
import {
  encryptIfPresent,
  decryptIfPresent,
  hashForSearch,
} from "@/core/crypto/fieldEncryption";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
} from "../lib/validators";
import type { EmployeeRow, EmployeeListItem } from "../types";

// ── Helpers de transformación ─────────────────────────────────

type DbEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  status: "ACTIVE" | "INACTIVE" | "TERMINATED";
  hireDate: Date;
  terminationDate: Date | null;
  notes: string | null;
  dniEncrypted: string | null;
  dniHash: string | null;
  nafEncrypted: string | null;
  phoneEncrypted: string | null;
  addressEncrypted: string | null;
  emergencyContactName: string | null;
  emergencyContactPhoneEncrypted: string | null;
  createdAt: Date;
  createdById: string;
  updatedById: string | null;
  deletedAt: Date | null;
};

function toEmployeeRow(e: DbEmployee): EmployeeRow {
  return {
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    fullName: `${e.firstName} ${e.lastName}`,
    email: e.email,
    status: e.status,
    hireDate: e.hireDate.toISOString().split("T")[0],
    terminationDate: e.terminationDate ? e.terminationDate.toISOString().split("T")[0] : null,
    dni: decryptIfPresent(e.dniEncrypted),
    naf: decryptIfPresent(e.nafEncrypted),
    phone: decryptIfPresent(e.phoneEncrypted),
    address: decryptIfPresent(e.addressEncrypted),
    emergencyContactName: e.emergencyContactName,
    emergencyContactPhone: decryptIfPresent(e.emergencyContactPhoneEncrypted),
    notes: e.notes,
    createdAt: e.createdAt.toISOString(),
  };
}

// ── Listado ───────────────────────────────────────────────────

export async function listEmployees(params?: {
  status?: "ACTIVE" | "INACTIVE" | "TERMINATED";
  excludeTerminated?: boolean; // true → excluye bajas (vista por defecto)
  search?: string; // busca por nombre/apellidos
}): Promise<EmployeeListItem[]> {
  const actor = await requirePermission("hr:employees:read");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {
    deletedAt: null,
    ...(params?.status
      ? { status: params.status }
      : params?.excludeTerminated
      ? { status: { not: "TERMINATED" } }
      : {}),
    ...(params?.search
      ? {
          OR: [
            {
              firstName: {
                contains: params.search,
                mode: "insensitive",
              },
            },
            {
              lastName: {
                contains: params.search,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const employees = await ((prisma as unknown as Record<string, unknown>)["employee"] as any).findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      status: true,
      hireDate: true,
      dniEncrypted: true,
      phoneEncrypted: true,
    },
  }) as {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    status: "ACTIVE" | "INACTIVE" | "TERMINATED";
    hireDate: Date;
    dniEncrypted: string | null;
    phoneEncrypted: string | null;
  }[];

  // ENCARGADO no ve datos sensibles
  const canSeeSensitive =
    actor.role === "ADMIN" || actor.role === "RRHH";

  return employees.map((e) => ({
    id: e.id,
    fullName: `${e.firstName} ${e.lastName}`,
    email: e.email,
    status: e.status,
    hireDate: e.hireDate.toISOString().split("T")[0],
    dni: canSeeSensitive ? decryptIfPresent(e.dniEncrypted) : null,
    phone: canSeeSensitive ? decryptIfPresent(e.phoneEncrypted) : null,
  }));
}

// ── Detalle ───────────────────────────────────────────────────

export async function getEmployee(id: string): Promise<EmployeeRow> {
  const actor = await requirePermission("hr:employees:read");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = await ((prisma as unknown as Record<string, unknown>)["employee"] as any).findUnique({
    where: { id, deletedAt: null },
  }) as DbEmployee | null;

  if (!e) {
    throw new Error("Empleado no encontrado");
  }

  // Auditar acceso a datos sensibles (sin datos personales en metadata)
  await auditLog({
    action: AUDIT_EMPLOYEE_DATA_ACCESSED,
    actorId: actor.id,
    targetType: "Employee",
    targetId: id,
  });

  return toEmployeeRow(e as DbEmployee);
}

// ── Crear ─────────────────────────────────────────────────────

export type CreateEmployeeState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: boolean;
  employeeId?: string;
};

export async function createEmployeeAction(
  _prev: CreateEmployeeState,
  formData: FormData
): Promise<CreateEmployeeState> {
  let actor: Awaited<ReturnType<typeof requirePermission>>;
  try {
    actor = await requirePermission("hr:employees:write");
  } catch {
    return { error: "No tienes permiso para crear empleados." };
  }

  const raw = {
    firstName: formData.get("firstName") as string,
    lastName: formData.get("lastName") as string,
    email: (formData.get("email") as string) || undefined,
    status: formData.get("status") as string,
    hireDate: formData.get("hireDate") as string,
    dni: (formData.get("dni") as string) || undefined,
    naf: (formData.get("naf") as string) || undefined,
    phone: (formData.get("phone") as string) || undefined,
    address: (formData.get("address") as string) || undefined,
    emergencyContactName:
      (formData.get("emergencyContactName") as string) || undefined,
    emergencyContactPhone:
      (formData.get("emergencyContactPhone") as string) || undefined,
    notes: (formData.get("notes") as string) || undefined,
  };

  const parsed = createEmployeeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const d = parsed.data;

  // Cifrar campos sensibles
  const dniHash = d.dni ? hashForSearch(d.dni) : null;

  try {
    const employee = await ((prisma as unknown as Record<string, unknown>)["employee"] as any).create({
      data: {
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email || null,
        status: d.status,
        hireDate: new Date(d.hireDate),
        notes: d.notes || null,
        dniEncrypted: encryptIfPresent(d.dni),
        dniHash,
        nafEncrypted: encryptIfPresent(d.naf),
        phoneEncrypted: encryptIfPresent(d.phone),
        addressEncrypted: encryptIfPresent(d.address),
        emergencyContactName: d.emergencyContactName || null,
        emergencyContactPhoneEncrypted: encryptIfPresent(
          d.emergencyContactPhone
        ),
        createdById: actor.id,
      },
    });

    await auditLog({
      action: AUDIT_EMPLOYEE_CREATED,
      actorId: actor.id,
      targetType: "Employee",
      targetId: employee.id,
      // No registrar datos sensibles en auditoría
      metadata: {
        name: `${d.firstName} ${d.lastName}`,
        status: d.status,
      },
    });

    revalidatePath("/hr");
    return { success: true, employeeId: employee.id };
  } catch (err) {
    console.error("[createEmployee] Error:", err);
    return { error: "Error al crear el empleado. Inténtalo de nuevo." };
  }
}

// ── Actualizar ────────────────────────────────────────────────

export type UpdateEmployeeState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: boolean;
};

export async function updateEmployeeAction(
  _prev: UpdateEmployeeState,
  formData: FormData
): Promise<UpdateEmployeeState> {
  let actor: Awaited<ReturnType<typeof requirePermission>>;
  try {
    actor = await requirePermission("hr:employees:write");
  } catch {
    return { error: "No tienes permiso para editar empleados." };
  }

  const raw = {
    id: formData.get("id") as string,
    firstName: formData.get("firstName") as string,
    lastName: formData.get("lastName") as string,
    email: (formData.get("email") as string) || undefined,
    status: formData.get("status") as string,
    hireDate: formData.get("hireDate") as string,
    dni: (formData.get("dni") as string) || undefined,
    naf: (formData.get("naf") as string) || undefined,
    phone: (formData.get("phone") as string) || undefined,
    address: (formData.get("address") as string) || undefined,
    emergencyContactName:
      (formData.get("emergencyContactName") as string) || undefined,
    emergencyContactPhone:
      (formData.get("emergencyContactPhone") as string) || undefined,
    notes: (formData.get("notes") as string) || undefined,
    terminationDate: (formData.get("terminationDate") as string) || null,
  };

  const parsed = updateEmployeeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const d = parsed.data;

  // Verificar que existe y no está eliminado
  const existing = await ((prisma as unknown as Record<string, unknown>)["employee"] as any).findUnique({
    where: { id: d.id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) {
    return { error: "Empleado no encontrado." };
  }

  const dniHash = d.dni ? hashForSearch(d.dni) : null;

  try {
    await ((prisma as unknown as Record<string, unknown>)["employee"] as any).update({
      where: { id: d.id },
      data: {
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email || null,
        status: d.status,
        hireDate: new Date(d.hireDate),
        terminationDate: d.terminationDate && d.terminationDate !== "" ? new Date(d.terminationDate) : null,
        notes: d.notes || null,
        dniEncrypted: encryptIfPresent(d.dni),
        dniHash,
        nafEncrypted: encryptIfPresent(d.naf),
        phoneEncrypted: encryptIfPresent(d.phone),
        addressEncrypted: encryptIfPresent(d.address),
        emergencyContactName: d.emergencyContactName || null,
        emergencyContactPhoneEncrypted: encryptIfPresent(
          d.emergencyContactPhone
        ),
        updatedById: actor.id,
      },
    });

    await auditLog({
      action: AUDIT_EMPLOYEE_UPDATED,
      actorId: actor.id,
      targetType: "Employee",
      targetId: d.id,
      metadata: {
        name: `${d.firstName} ${d.lastName}`,
        status: d.status,
      },
    });

    revalidatePath("/hr");
    revalidatePath(`/hr/${d.id}`);
    return { success: true };
  } catch (err) {
    console.error("[updateEmployee] Error:", err);
    return { error: "Error al actualizar el empleado. Inténtalo de nuevo." };
  }
}

// ── Baja lógica (soft delete) ─────────────────────────────────

export async function archiveEmployeeAction(
  employeeId: string
): Promise<{ error?: string; success?: boolean }> {
  let actor: Awaited<ReturnType<typeof requirePermission>>;
  try {
    actor = await requirePermission("hr:employees:write");
  } catch {
    return { error: "No tienes permiso para dar de baja empleados." };
  }

  const existing = await ((prisma as unknown as Record<string, unknown>)["employee"] as any).findUnique({
    where: { id: employeeId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!existing) {
    return { error: "Empleado no encontrado." };
  }

  await ((prisma as unknown as Record<string, unknown>)["employee"] as any).update({
    where: { id: employeeId },
    data: {
      deletedAt: new Date(),
      status: "TERMINATED",
      updatedById: actor.id,
    },
  });

  await auditLog({
    action: AUDIT_EMPLOYEE_ARCHIVED,
    actorId: actor.id,
    targetType: "Employee",
    targetId: employeeId,
    metadata: {
      name: `${existing.firstName} ${existing.lastName}`,
    },
  });

  revalidatePath("/hr");
  return { success: true };
}

// ── Eliminación permanente ────────────────────────────────────

/**
 * Elimina un empleado de forma permanente (hard delete).
 * Solo ADMIN. Borra en cascada todos los registros vinculados.
 * Los StoredFiles físicos se dejan en disco (audit trail); solo se desvinculan.
 */
export async function deleteEmployeePermanentlyAction(
  employeeId: string
): Promise<{ error?: string; success?: boolean }> {
  let actor: { id: string; role: string };
  try {
    actor = await requirePermission("users:manage"); // Solo ADMIN tiene este permiso
  } catch {
    return { error: "Solo los administradores pueden eliminar empleados permanentemente." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emp = await ((prisma as unknown as Record<string, unknown>)["employee"] as any).findUnique({
    where: { id: employeeId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!emp) return { error: "Empleado no encontrado." };

  // Eliminar en orden para respetar FK (sin cascade en Employee)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prisma as any;

  // 1. Documentos del empleado (solo el registro, el StoredFile se desvincula)
  await p.employeeDocument.deleteMany({ where: { employeeId } });

  // 2. PDFs de jornada y jornadas (TimeRecordDay tiene cascade)
  const records = await p.timeRecord.findMany({
    where: { employeeId },
    select: { id: true },
  });
  const recordIds = records.map((r: { id: string }) => r.id);
  if (recordIds.length > 0) {
    await p.timeRecordPdf.deleteMany({ where: { timeRecordId: { in: recordIds } } });
    await p.timeRecord.deleteMany({ where: { id: { in: recordIds } } });
  }

  // 3. Horarios (ScheduleDay tiene cascade)
  await p.weeklySchedule.deleteMany({ where: { employeeId } });

  // 4. Contratos
  await p.contract.deleteMany({ where: { employeeId } });

  // 5. Empleado
  await p.employee.delete({ where: { id: employeeId } });

  await auditLog({
    action: "EMPLOYEE_PERMANENTLY_DELETED",
    actorId: actor.id,
    targetType: "Employee",
    targetId: employeeId,
    metadata: { name: `${emp.firstName} ${emp.lastName}` },
  });

  revalidatePath("/hr");
  return { success: true };
}
