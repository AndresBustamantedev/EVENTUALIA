/**
 * Tipos del módulo de RRHH — Cruz Blanca Gestión
 *
 * Separa los tipos de base de datos (con campos cifrados)
 * de los tipos de presentación (con campos en claro).
 */

// ── Enumeraciones ─────────────────────────────────────────────

export type EmployeeStatus = "ACTIVE" | "INACTIVE" | "TERMINATED";

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  TERMINATED: "Baja",
};

export const CONTRACT_TYPES = [
  "indefinido",
  "temporal",
  "formacion",
  "interinidad",
  "obra_servicio",
  "otro",
] as const;

export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  indefinido: "Indefinido",
  temporal: "Temporal",
  formacion: "En prácticas / formación",
  interinidad: "Interinidad",
  obra_servicio: "Obra y servicio",
  otro: "Otro",
};

export const DAY_NAMES: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

// ── Tipos de presentación (campos en claro) ──────────────────

export interface EmployeeRow {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  status: EmployeeStatus;
  hireDate: string; // ISO date "YYYY-MM-DD"
  terminationDate: string | null; // ISO date "YYYY-MM-DD"
  // Campos descifrados:
  dni: string | null;
  naf: string | null;
  phone: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  createdAt: string;
}

export interface EmployeeListItem {
  id: string;
  fullName: string;
  email: string | null;
  status: EmployeeStatus;
  hireDate: string;
  // Solo para ADMIN/RRHH:
  dni: string | null;
  phone: string | null;
}

export interface ContractRow {
  id: string;
  employeeId: string;
  contractType: ContractType;
  startDate: string;
  endDate: string | null;
  weeklyHours: string; // Decimal serializado
  monthlyHours: string | null;
  isFullTime: boolean;
  notes: string | null;
  createdAt: string;
  createdByName: string;
}

export interface ScheduleDayInput {
  dayOfWeek: number; // 1–7
  isRestDay: boolean;
  morningStart: string | null; // "HH:MM"
  morningEnd: string | null;
  afternoonStart: string | null;
  afternoonEnd: string | null;
}

export interface WeeklyScheduleRow {
  id: string;
  employeeId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  createdAt: string;
  createdByName: string;
  days: ScheduleDayInput[];
}

// ── Tipos para formularios ────────────────────────────────────

export interface CreateEmployeeInput {
  firstName: string;
  lastName: string;
  email?: string;
  status: EmployeeStatus;
  hireDate: string;
  dni?: string;
  naf?: string;
  phone?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  notes?: string;
}

export interface UpdateEmployeeInput extends CreateEmployeeInput {
  id: string;
}

export interface CreateContractInput {
  employeeId: string;
  contractType: ContractType;
  startDate: string;
  endDate?: string;
  weeklyHours: number;
  monthlyHours?: number;
  isFullTime: boolean;
  notes?: string;
}

export interface CreateScheduleInput {
  employeeId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  notes?: string;
  days: ScheduleDayInput[];
}

// ── Permisos RBAC para RRHH ──────────────────────────────────

export const HR_PERMISSIONS = {
  READ: "hr:employees:read",
  WRITE: "hr:employees:write",
  DELETE: "hr:employees:delete",
  CONTRACTS_READ: "hr:contracts:read",
  CONTRACTS_WRITE: "hr:contracts:write",
  SCHEDULES_READ: "hr:schedules:read",
  SCHEDULES_WRITE: "hr:schedules:write",
} as const;

export type HrPermission = (typeof HR_PERMISSIONS)[keyof typeof HR_PERMISSIONS];
