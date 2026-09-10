/**
 * Tests unitarios — utilidades de registro de jornada
 */
import { describe, it, expect } from "vitest";
import {
  calcDayMinutes,
  buildMonthPresets,
  sumMinutes,
  formatMonthYear,
  MONTH_NAMES_ES,
  DAY_TYPE_LABELS,
} from "../../src/modules/hr/lib/timeRecordUtils";
import type { DayPreset } from "../../src/modules/hr/lib/timeRecordUtils";

// ── calcDayMinutes ────────────────────────────────────────────

describe("calcDayMinutes", () => {
  it("devuelve 0 sin tramos", () => {
    expect(calcDayMinutes({})).toBe(0);
  });

  it("calcula un único tramo de mañana", () => {
    // 09:00–14:00 = 300 min
    expect(
      calcDayMinutes({ morningStart: "09:00", morningEnd: "14:00" })
    ).toBe(300);
  });

  it("calcula dos tramos sin cruce de medianoche", () => {
    // 09:00–14:00 (300) + 15:30–19:30 (240) = 540
    expect(
      calcDayMinutes({
        morningStart: "09:00",
        morningEnd: "14:00",
        afternoonStart: "15:30",
        afternoonEnd: "19:30",
      })
    ).toBe(540);
  });

  it("soporta cruce de medianoche en tramo de tarde", () => {
    // 22:00–02:00 = 240 min
    expect(
      calcDayMinutes({ afternoonStart: "22:00", afternoonEnd: "02:00" })
    ).toBe(240);
  });

  it("ignora tramo incompleto (solo inicio)", () => {
    expect(
      calcDayMinutes({ morningStart: "09:00" })
    ).toBe(0);
  });

  it("ignora tramo incompleto (solo fin)", () => {
    expect(
      calcDayMinutes({ morningEnd: "14:00" })
    ).toBe(0);
  });

  it("maneja null en los campos", () => {
    expect(
      calcDayMinutes({ morningStart: null, morningEnd: null })
    ).toBe(0);
  });
});

// ── buildMonthPresets ─────────────────────────────────────────

describe("buildMonthPresets", () => {
  // Horario de lunes a viernes, 09:00-14:00 + 15:00-18:00
  const MF_SCHEDULE = [1, 2, 3, 4, 5].map((dow) => ({
    dayOfWeek: dow,
    isRestDay: false,
    morningStart: "09:00",
    morningEnd: "14:00",
    afternoonStart: "15:00",
    afternoonEnd: "18:00",
  }));

  it("genera el número correcto de días para enero 2026 (31 días)", () => {
    const presets = buildMonthPresets(2026, 1, MF_SCHEDULE);
    expect(presets).toHaveLength(31);
  });

  it("genera el número correcto de días para febrero de año bisiesto (2024, 29 días)", () => {
    const presets = buildMonthPresets(2024, 2, MF_SCHEDULE);
    expect(presets).toHaveLength(29);
  });

  it("genera el número correcto de días para febrero no bisiesto (2025, 28 días)", () => {
    const presets = buildMonthPresets(2025, 2, MF_SCHEDULE);
    expect(presets).toHaveLength(28);
  });

  it("marca como WORK los días laborables", () => {
    const presets = buildMonthPresets(2026, 1, MF_SCHEDULE);
    // 2026-01-01 es jueves (día laborable)
    const thu = presets.find((p) => p.date === "2026-01-01");
    expect(thu?.dayType).toBe("WORK");
    expect(thu?.morningStart).toBe("09:00");
    expect(thu?.totalMinutes).toBe(480); // 300 + 180
  });

  it("marca como REST los fines de semana", () => {
    const presets = buildMonthPresets(2026, 1, MF_SCHEDULE);
    // 2026-01-03 es sábado
    const sat = presets.find((p) => p.date === "2026-01-03");
    expect(sat?.dayType).toBe("REST");
    expect(sat?.totalMinutes).toBe(0);
    expect(sat?.morningStart).toBeNull();
  });

  it("genera fecha en formato YYYY-MM-DD", () => {
    const presets = buildMonthPresets(2026, 1, MF_SCHEDULE);
    expect(presets[0].date).toBe("2026-01-01");
    expect(presets[30].date).toBe("2026-01-31");
  });

  it("inicializa ordinaryMinutes = totalMinutes y overtimeMinutes = 0", () => {
    const presets = buildMonthPresets(2026, 1, MF_SCHEDULE);
    const workDays = presets.filter((p) => p.dayType === "WORK");
    workDays.forEach((d) => {
      expect(d.ordinaryMinutes).toBe(d.totalMinutes);
      expect(d.overtimeMinutes).toBe(0);
    });
  });

  it("con horario vacío todos los días son REST", () => {
    const presets = buildMonthPresets(2026, 3, []);
    expect(presets.every((p) => p.dayType === "REST")).toBe(true);
    expect(presets).toHaveLength(31);
  });

  it("con isRestDay=true el día se marca como REST aunque existan horas", () => {
    const scheduleWithRestMonday = [
      {
        dayOfWeek: 1,
        isRestDay: true,
        morningStart: "09:00",
        morningEnd: "14:00",
        afternoonStart: null,
        afternoonEnd: null,
      },
    ];
    const presets = buildMonthPresets(2026, 1, scheduleWithRestMonday);
    // 2026-01-05 es lunes
    const mon = presets.find((p) => p.date === "2026-01-05");
    expect(mon?.dayType).toBe("REST");
    expect(mon?.totalMinutes).toBe(0);
  });
});

// ── sumMinutes ────────────────────────────────────────────────

describe("sumMinutes", () => {
  it("suma cero con lista vacía", () => {
    expect(sumMinutes([])).toEqual({ ordinaryMinutes: 0, overtimeMinutes: 0 });
  });

  it("suma correctamente múltiples días", () => {
    const days = [
      { ordinaryMinutes: 480, overtimeMinutes: 0 },
      { ordinaryMinutes: 300, overtimeMinutes: 60 },
      { ordinaryMinutes: 0, overtimeMinutes: 0 },
    ];
    expect(sumMinutes(days)).toEqual({ ordinaryMinutes: 780, overtimeMinutes: 60 });
  });

  it("trata null como 0", () => {
    const days = [
      { ordinaryMinutes: null, overtimeMinutes: null },
      { ordinaryMinutes: 240, overtimeMinutes: 30 },
    ];
    expect(sumMinutes(days)).toEqual({ ordinaryMinutes: 240, overtimeMinutes: 30 });
  });
});

// ── formatMonthYear ───────────────────────────────────────────

describe("formatMonthYear", () => {
  it("formatea enero 2026", () => {
    expect(formatMonthYear(2026, 1)).toBe("Enero 2026");
  });

  it("formatea diciembre 2025", () => {
    expect(formatMonthYear(2025, 12)).toBe("Diciembre 2025");
  });

  it("formatea septiembre 2024", () => {
    expect(formatMonthYear(2024, 9)).toBe("Septiembre 2024");
  });
});

// ── MONTH_NAMES_ES ────────────────────────────────────────────

describe("MONTH_NAMES_ES", () => {
  it("tiene 13 entradas (índice 0 vacío)", () => {
    expect(MONTH_NAMES_ES).toHaveLength(13);
    expect(MONTH_NAMES_ES[0]).toBe("");
  });

  it("el índice 1 es Enero y el 12 es Diciembre", () => {
    expect(MONTH_NAMES_ES[1]).toBe("Enero");
    expect(MONTH_NAMES_ES[12]).toBe("Diciembre");
  });
});

// ── DAY_TYPE_LABELS ───────────────────────────────────────────

describe("DAY_TYPE_LABELS", () => {
  it("tiene etiqueta para WORK", () => {
    expect(DAY_TYPE_LABELS.WORK).toBe("Trabajo");
  });

  it("tiene etiqueta para SICK_LEAVE", () => {
    expect(DAY_TYPE_LABELS.SICK_LEAVE).toBe("Baja médica");
  });

  it("tiene etiqueta para VACATION", () => {
    expect(DAY_TYPE_LABELS.VACATION).toBe("Vacaciones");
  });
});
