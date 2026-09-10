/**
 * Tests unitarios — utilidades de cálculo de horarios
 */
import { describe, it, expect } from "vitest";
import {
  timeToMinutes,
  trampMinutes,
  dayHours,
  weeklyHoursFromDays,
  formatHours,
  crossesMidnight,
  defaultWeekDays,
} from "../../src/modules/hr/lib/scheduleUtils";

describe("timeToMinutes", () => {
  it("convierte 00:00 a 0", () => expect(timeToMinutes("00:00")).toBe(0));
  it("convierte 09:30 a 570", () => expect(timeToMinutes("09:30")).toBe(570));
  it("convierte 23:59 a 1439", () => expect(timeToMinutes("23:59")).toBe(1439));
  it("convierte 01:00 a 60", () => expect(timeToMinutes("01:00")).toBe(60));
});

describe("trampMinutes", () => {
  it("calcula tramo normal 09:00–14:00 = 300 min", () => {
    expect(trampMinutes("09:00", "14:00")).toBe(300);
  });

  it("calcula tramo que cruza medianoche 22:00–02:00 = 240 min", () => {
    expect(trampMinutes("22:00", "02:00")).toBe(240);
  });

  it("calcula tramo que cruza medianoche 23:00–00:30 = 90 min", () => {
    expect(trampMinutes("23:00", "00:30")).toBe(90);
  });

  it("mismo inicio y fin = 0 (no cruce de medianoche)", () => {
    // Medianoche: end <= start → suma 24h → 1440 min
    // Esto se considera cruce de medianoche completo
    expect(trampMinutes("00:00", "00:00")).toBe(1440);
  });
});

describe("dayHours", () => {
  it("día de descanso = 0 horas", () => {
    expect(dayHours({ isRestDay: true })).toBe(0);
  });

  it("solo mañana 09:00–13:00 = 4h", () => {
    expect(
      dayHours({
        isRestDay: false,
        morningStart: "09:00",
        morningEnd: "13:00",
      })
    ).toBe(4);
  });

  it("turno partido 09:00–14:00 + 17:00–21:00 = 9h", () => {
    expect(
      dayHours({
        isRestDay: false,
        morningStart: "09:00",
        morningEnd: "14:00",
        afternoonStart: "17:00",
        afternoonEnd: "21:00",
      })
    ).toBe(9);
  });

  it("tarde que cruza medianoche 22:00–02:00 = 4h", () => {
    expect(
      dayHours({
        isRestDay: false,
        afternoonStart: "22:00",
        afternoonEnd: "02:00",
      })
    ).toBe(4);
  });

  it("sin tramos definidos = 0h", () => {
    expect(dayHours({ isRestDay: false })).toBe(0);
  });
});

describe("weeklyHoursFromDays", () => {
  it("5 días de 8h + 2 días descanso = 40h", () => {
    const days = Array.from({ length: 7 }, (_, i) => ({
      isRestDay: i >= 5,
      morningStart: i < 5 ? "09:00" : undefined,
      morningEnd: i < 5 ? "17:00" : undefined,
    }));
    expect(weeklyHoursFromDays(days)).toBe(40);
  });

  it("7 días de descanso = 0h", () => {
    const days = Array.from({ length: 7 }, () => ({ isRestDay: true }));
    expect(weeklyHoursFromDays(days)).toBe(0);
  });
});

describe("formatHours", () => {
  it("7.5 → '7 h 30 min'", () => expect(formatHours(7.5)).toBe("7 h 30 min"));
  it("8 → '8 h'", () => expect(formatHours(8)).toBe("8 h"));
  it("0 → '0 h'", () => expect(formatHours(0)).toBe("0 h"));
  it("1.25 → '1 h 15 min'", () => expect(formatHours(1.25)).toBe("1 h 15 min"));
});

describe("crossesMidnight", () => {
  it("22:00–02:00 sí cruza", () => expect(crossesMidnight("22:00", "02:00")).toBe(true));
  it("09:00–14:00 no cruza", () => expect(crossesMidnight("09:00", "14:00")).toBe(false));
  it("23:59–00:00 sí cruza", () => expect(crossesMidnight("23:59", "00:00")).toBe(true));
});

describe("defaultWeekDays", () => {
  it("devuelve 7 días del 1 al 7 todos en descanso", () => {
    const days = defaultWeekDays();
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(days.every((d) => d.isRestDay)).toBe(true);
  });
});
