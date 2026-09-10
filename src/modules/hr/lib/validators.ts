/**
 * Validadores Zod para el módulo de RRHH
 *
 * Reglas de negocio (no legales — son documentos administrativos editables):
 * - DNI/NIE: formato español estándar, sin revelar en logs
 * - NAF: Número de Afiliación a la Seguridad Social (12 dígitos)
 * - Teléfono: 9 dígitos, puede llevar prefijo +34
 * - Horas: rango razonable para hostelería
 * - Horarios: "HH:MM", puede cruzar medianoche
 */
import { z } from "zod";
import { CONTRACT_TYPES } from "../types";

// ── Patrones ─────────────────────────────────────────────────

// DNI: 8 dígitos + letra
const DNI_REGEX = /^\d{8}[A-Za-z]$/;
// NIE: X/Y/Z + 7 dígitos + letra
const NIE_REGEX = /^[XYZxyz]\d{7}[A-Za-z]$/;
// NAF: 2 dígitos de provincia + 10 dígitos → total 12
const NAF_REGEX = /^\d{12}$/;
// Teléfono: 9 dígitos (puede incluir +34 al principio)
const PHONE_REGEX = /^(?:\+34\s?)?[6789]\d{8}$/;
// Hora "HH:MM"
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ── Helpers ───────────────────────────────────────────────────

const optionalString = z.string().trim().optional().or(z.literal(""));

const timeField = z
  .string()
  .regex(TIME_REGEX, "Formato de hora inválido (HH:MM)")
  .nullable()
  .optional();

// ── Schemas principales ───────────────────────────────────────

export const createEmployeeSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(100, "Nombre demasiado largo"),

  lastName: z
    .string()
    .trim()
    .min(1, "Los apellidos son obligatorios")
    .max(150, "Apellidos demasiado largos"),

  email: z
    .string()
    .trim()
    .email("Email inválido")
    .max(254)
    .optional()
    .or(z.literal("")),

  status: z.enum(["ACTIVE", "INACTIVE", "TERMINATED"], {
    errorMap: () => ({ message: "Estado inválido" }),
  }),

  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),

  // Campos sensibles — validación de formato sin loguear el valor
  dni: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (v) => v === "" || DNI_REGEX.test(v) || NIE_REGEX.test(v),
      "DNI/NIE inválido (formato: 12345678A o X1234567B)"
    )
    .optional()
    .or(z.literal("")),

  naf: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || NAF_REGEX.test(v),
      "NAF inválido (12 dígitos)"
    )
    .optional()
    .or(z.literal("")),

  phone: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || PHONE_REGEX.test(v.replace(/\s/g, "")),
      "Teléfono inválido"
    )
    .optional()
    .or(z.literal("")),

  address: optionalString.pipe(z.string().max(500).optional().or(z.literal(""))),

  emergencyContactName: optionalString.pipe(
    z.string().max(150).optional().or(z.literal(""))
  ),

  emergencyContactPhone: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || PHONE_REGEX.test(v.replace(/\s/g, "")),
      "Teléfono de emergencia inválido"
    )
    .optional()
    .or(z.literal("")),

  notes: optionalString.pipe(z.string().max(2000).optional().or(z.literal(""))),
});

export const updateEmployeeSchema = createEmployeeSchema.extend({
  id: z.string().uuid("ID de empleado inválido"),
  terminationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .nullable()
    .optional()
    .or(z.literal("")),
});

// ── Contrato ──────────────────────────────────────────────────

export const createContractSchema = z
  .object({
    employeeId: z.string().uuid("ID de empleado inválido"),

    contractType: z.enum(CONTRACT_TYPES, {
      errorMap: () => ({ message: "Tipo de contrato inválido" }),
    }),

    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de inicio inválida"),

    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de fin inválida")
      .optional()
      .or(z.literal("")),

    weeklyHours: z
      .number({ invalid_type_error: "Horas semanales inválidas" })
      .positive("Las horas deben ser positivas")
      .max(168, "No pueden superar las 168 h/semana"),

    monthlyHours: z
      .number()
      .positive()
      .max(744, "No pueden superar las 744 h/mes")
      .optional(),

    isFullTime: z.boolean(),

    notes: optionalString.pipe(z.string().max(2000).optional().or(z.literal(""))),
  })
  .refine(
    (d) => {
      if (d.endDate && d.endDate !== "") {
        return d.endDate >= d.startDate;
      }
      return true;
    },
    {
      message: "La fecha de fin debe ser posterior a la de inicio",
      path: ["endDate"],
    }
  );

// ── Día de horario ────────────────────────────────────────────

export const scheduleDaySchema = z
  .object({
    dayOfWeek: z.number().int().min(1).max(7),
    isRestDay: z.boolean(),
    morningStart: timeField,
    morningEnd: timeField,
    afternoonStart: timeField,
    afternoonEnd: timeField,
  })
  .refine(
    (d) => {
      if (d.isRestDay) return true;
      // Al menos un tramo definido
      const hasMorning = d.morningStart && d.morningEnd;
      const hasAfternoon = d.afternoonStart && d.afternoonEnd;
      return hasMorning || hasAfternoon;
    },
    {
      message: "Un día no descanso debe tener al menos un tramo horario",
    }
  );

// ── Horario semanal ───────────────────────────────────────────

export const createScheduleSchema = z
  .object({
    employeeId: z.string().uuid("ID de empleado inválido"),

    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de vigencia inválida"),

    effectiveTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de fin de vigencia inválida")
      .optional()
      .or(z.literal("")),

    notes: optionalString.pipe(z.string().max(2000).optional().or(z.literal(""))),

    days: z
      .array(scheduleDaySchema)
      .length(7, "El horario debe incluir los 7 días de la semana"),
  })
  .refine(
    (d) => {
      if (d.effectiveTo && d.effectiveTo !== "") {
        return d.effectiveTo >= d.effectiveFrom;
      }
      return true;
    },
    {
      message: "La fecha de fin de vigencia debe ser posterior a la de inicio",
      path: ["effectiveTo"],
    }
  )
  .refine(
    (d) => {
      const days = d.days.map((day) => day.dayOfWeek).sort();
      return days.join(",") === "1,2,3,4,5,6,7";
    },
    {
      message: "Faltan días de la semana en el horario",
      path: ["days"],
    }
  );

// ── Tipos inferidos ───────────────────────────────────────────

export type CreateEmployeeData = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeData = z.infer<typeof updateEmployeeSchema>;
export type CreateContractData = z.infer<typeof createContractSchema>;
export type CreateScheduleData = z.infer<typeof createScheduleSchema>;
export type ScheduleDayData = z.infer<typeof scheduleDaySchema>;
