/**
 * Tests unitarios — validadores del módulo RRHH
 */
import { describe, it, expect } from "vitest";
import {
  createEmployeeSchema,
  createContractSchema,
  createScheduleSchema,
  scheduleDaySchema,
} from "../../src/modules/hr/lib/validators";

// ── Empleado ──────────────────────────────────────────────────

const validEmployee = {
  firstName: "Juan",
  lastName: "García Pérez",
  status: "ACTIVE",
  hireDate: "2024-01-15",
};

describe("createEmployeeSchema", () => {
  it("acepta datos mínimos válidos", () => {
    expect(createEmployeeSchema.safeParse(validEmployee).success).toBe(true);
  });

  it("requiere firstName y lastName", () => {
    const r = createEmployeeSchema.safeParse({ ...validEmployee, firstName: "" });
    expect(r.success).toBe(false);
  });

  it("valida DNI español (8 dígitos + letra)", () => {
    const ok = createEmployeeSchema.safeParse({ ...validEmployee, dni: "12345678A" });
    expect(ok.success).toBe(true);
  });

  it("valida NIE (X/Y/Z + 7 dígitos + letra)", () => {
    const ok = createEmployeeSchema.safeParse({ ...validEmployee, dni: "X1234567B" });
    expect(ok.success).toBe(true);
  });

  it("rechaza DNI con formato incorrecto", () => {
    const r = createEmployeeSchema.safeParse({ ...validEmployee, dni: "1234567" });
    expect(r.success).toBe(false);
  });

  it("valida NAF de 11 dígitos", () => {
    const ok = createEmployeeSchema.safeParse({ ...validEmployee, naf: "28123456789" });
    expect(ok.success).toBe(true);
  });

  it("rechaza NAF con longitud incorrecta", () => {
    const r = createEmployeeSchema.safeParse({ ...validEmployee, naf: "281234" });
    expect(r.success).toBe(false);
  });

  it("valida teléfono móvil español", () => {
    const ok = createEmployeeSchema.safeParse({ ...validEmployee, phone: "612345678" });
    expect(ok.success).toBe(true);
  });

  it("acepta teléfono con prefijo +34", () => {
    const ok = createEmployeeSchema.safeParse({ ...validEmployee, phone: "+34612345678" });
    expect(ok.success).toBe(true);
  });

  it("rechaza teléfono con formato incorrecto", () => {
    const r = createEmployeeSchema.safeParse({ ...validEmployee, phone: "1234" });
    expect(r.success).toBe(false);
  });

  it("acepta email vacío", () => {
    const ok = createEmployeeSchema.safeParse({ ...validEmployee, email: "" });
    expect(ok.success).toBe(true);
  });

  it("rechaza email con formato incorrecto", () => {
    const r = createEmployeeSchema.safeParse({ ...validEmployee, email: "no-es-email" });
    expect(r.success).toBe(false);
  });

  it("rechaza estado inválido", () => {
    const r = createEmployeeSchema.safeParse({ ...validEmployee, status: "INEXISTENTE" });
    expect(r.success).toBe(false);
  });
});

// ── Contrato ──────────────────────────────────────────────────

const validContract = {
  employeeId: "550e8400-e29b-41d4-a716-446655440000",
  contractType: "indefinido",
  startDate: "2024-01-01",
  weeklyHours: 40,
  isFullTime: true,
};

describe("createContractSchema", () => {
  it("acepta contrato válido sin fecha fin", () => {
    expect(createContractSchema.safeParse(validContract).success).toBe(true);
  });

  it("acepta contrato con fecha fin posterior a inicio", () => {
    const ok = createContractSchema.safeParse({
      ...validContract,
      contractType: "temporal",
      endDate: "2024-12-31",
    });
    expect(ok.success).toBe(true);
  });

  it("rechaza fecha fin anterior a inicio", () => {
    const r = createContractSchema.safeParse({
      ...validContract,
      endDate: "2023-12-31",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza horas semanales negativas", () => {
    const r = createContractSchema.safeParse({ ...validContract, weeklyHours: -5 });
    expect(r.success).toBe(false);
  });

  it("rechaza horas semanales mayores a 168", () => {
    const r = createContractSchema.safeParse({ ...validContract, weeklyHours: 200 });
    expect(r.success).toBe(false);
  });

  it("rechaza tipo de contrato desconocido", () => {
    const r = createContractSchema.safeParse({ ...validContract, contractType: "raro" });
    expect(r.success).toBe(false);
  });
});

// ── Día de horario ────────────────────────────────────────────

describe("scheduleDaySchema", () => {
  it("acepta día de descanso sin tramos", () => {
    const ok = scheduleDaySchema.safeParse({ dayOfWeek: 1, isRestDay: true });
    expect(ok.success).toBe(true);
  });

  it("acepta día con tramo de mañana", () => {
    const ok = scheduleDaySchema.safeParse({
      dayOfWeek: 2,
      isRestDay: false,
      morningStart: "09:00",
      morningEnd: "14:00",
    });
    expect(ok.success).toBe(true);
  });

  it("acepta tramo que cruza medianoche", () => {
    const ok = scheduleDaySchema.safeParse({
      dayOfWeek: 6,
      isRestDay: false,
      afternoonStart: "22:00",
      afternoonEnd: "02:00",
    });
    expect(ok.success).toBe(true);
  });

  it("rechaza día no-descanso sin tramos", () => {
    const r = scheduleDaySchema.safeParse({ dayOfWeek: 3, isRestDay: false });
    expect(r.success).toBe(false);
  });

  it("rechaza formato de hora incorrecto", () => {
    const r = scheduleDaySchema.safeParse({
      dayOfWeek: 1,
      isRestDay: false,
      morningStart: "25:00",
      morningEnd: "28:00",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza dayOfWeek fuera de rango 1-7", () => {
    const r = scheduleDaySchema.safeParse({ dayOfWeek: 8, isRestDay: true });
    expect(r.success).toBe(false);
  });
});

// ── Horario semanal ───────────────────────────────────────────

const sevenDays = Array.from({ length: 7 }, (_, i) => ({
  dayOfWeek: i + 1,
  isRestDay: i >= 5, // Sáb y Dom de descanso
  morningStart: i < 5 ? "09:00" : null,
  morningEnd: i < 5 ? "14:00" : null,
  afternoonStart: i < 5 ? "17:00" : null,
  afternoonEnd: i < 5 ? "21:00" : null,
}));

const validSchedule = {
  employeeId: "550e8400-e29b-41d4-a716-446655440000",
  effectiveFrom: "2024-01-01",
  days: sevenDays,
};

describe("createScheduleSchema", () => {
  it("acepta horario completo de 7 días", () => {
    expect(createScheduleSchema.safeParse(validSchedule).success).toBe(true);
  });

  it("rechaza si faltan días (menos de 7)", () => {
    const r = createScheduleSchema.safeParse({
      ...validSchedule,
      days: sevenDays.slice(0, 5),
    });
    expect(r.success).toBe(false);
  });

  it("rechaza fecha de fin anterior a la de inicio", () => {
    const r = createScheduleSchema.safeParse({
      ...validSchedule,
      effectiveTo: "2023-12-31",
    });
    expect(r.success).toBe(false);
  });

  it("acepta fecha de fin posterior a la de inicio", () => {
    const ok = createScheduleSchema.safeParse({
      ...validSchedule,
      effectiveTo: "2024-12-31",
    });
    expect(ok.success).toBe(true);
  });
});
