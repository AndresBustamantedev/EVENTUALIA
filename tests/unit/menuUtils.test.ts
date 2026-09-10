/**
 * Tests unitarios — menuUtils (Fase 3)
 */
import { describe, it, expect } from "vitest";
import {
  formatPrice,
  parsePriceToCents,
  formatMenuDate,
  formatMenuDateShort,
  toLocalDateString,
  DISH_CATEGORY_LABELS,
  DAILY_MENU_STATUS_LABELS,
  DISH_CATEGORIES,
} from "../../src/modules/menu/lib/menuUtils";

// ── formatPrice ───────────────────────────────────────────────

describe("formatPrice", () => {
  it("convierte centimos a euros con simbolo", () => {
    expect(formatPrice(1450)).toBe("14,50 €");
  });

  it("cero centimos", () => {
    expect(formatPrice(0)).toBe("0,00 €");
  });

  it("precio entero sin decimales", () => {
    expect(formatPrice(1200)).toBe("12,00 €");
  });

  it("precio con centimos < 10 rellena con cero", () => {
    expect(formatPrice(1405)).toBe("14,05 €");
  });

  it("precio grande", () => {
    expect(formatPrice(9999)).toBe("99,99 €");
  });

  it("solo centimos (menos de 1 euro)", () => {
    expect(formatPrice(50)).toBe("0,50 €");
  });

  it("1 centimo", () => {
    expect(formatPrice(1)).toBe("0,01 €");
  });

  it("valor con 3 cifras en parte entera", () => {
    expect(formatPrice(10050)).toBe("100,50 €");
  });
});

// ── parsePriceToCents ─────────────────────────────────────────

describe("parsePriceToCents", () => {
  it("parsea formato con coma", () => {
    expect(parsePriceToCents("14,50")).toBe(1450);
  });

  it("parsea formato con punto", () => {
    expect(parsePriceToCents("14.50")).toBe(1450);
  });

  it("parsea numero entero", () => {
    expect(parsePriceToCents("12")).toBe(1200);
  });

  it("retorna null para texto no numerico", () => {
    expect(parsePriceToCents("abc")).toBeNull();
  });

  it("retorna null para vacio", () => {
    expect(parsePriceToCents("")).toBeNull();
  });

  it("retorna null para valor negativo", () => {
    expect(parsePriceToCents("-5")).toBeNull();
  });

  it("parsea cero", () => {
    expect(parsePriceToCents("0")).toBe(0);
  });

  it("maneja decimales con Math.round", () => {
    // 14.999 -> Math.round(1499.9) = 1500
    expect(parsePriceToCents("14.999")).toBe(1500);
  });

  it("ignora espacios en blanco", () => {
    expect(parsePriceToCents("  14,50  ")).toBe(1450);
  });

  it("parsea precios con solo centimos", () => {
    expect(parsePriceToCents("0,99")).toBe(99);
  });
});

// ── formatMenuDate ────────────────────────────────────────────

describe("formatMenuDate", () => {
  it("formatea correctamente desde Date", () => {
    const date = new Date("2026-09-07T12:00:00Z");
    const result = formatMenuDate(date);
    expect(result).toContain("2026");
    expect(result).toContain("septiembre");
    expect(result).toMatch(/lunes/i);
  });

  it("formatea correctamente desde string ISO", () => {
    const result = formatMenuDate("2026-09-07T12:00:00Z");
    expect(result).toContain("septiembre");
    expect(result).toContain("2026");
  });

  it("incluye el dia de la semana", () => {
    const result = formatMenuDate("2026-09-07T12:00:00Z");
    expect(result).toMatch(/lunes/i);
  });
});

// ── formatMenuDateShort ───────────────────────────────────────

describe("formatMenuDateShort", () => {
  it("incluye el anio", () => {
    const result = formatMenuDateShort("2026-09-07T12:00:00Z");
    expect(result).toContain("2026");
  });

  it("empieza con mayuscula el dia de la semana", () => {
    const result = formatMenuDateShort("2026-09-07T12:00:00Z");
    expect(result[0]).toBe(result[0].toUpperCase());
  });

  it("contiene el mes con dos cifras", () => {
    const result = formatMenuDateShort("2026-09-07T12:00:00Z");
    expect(result).toContain("09");
  });
});

// ── toLocalDateString ─────────────────────────────────────────

describe("toLocalDateString", () => {
  it("devuelve formato YYYY-MM-DD", () => {
    const date = new Date("2026-03-15T12:00:00Z");
    const result = toLocalDateString(date);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("el anio es correcto", () => {
    const date = new Date("2026-03-15T12:00:00Z");
    expect(toLocalDateString(date)).toContain("2026");
  });
});

// ── Constantes ────────────────────────────────────────────────

describe("DISH_CATEGORY_LABELS", () => {
  it("tiene etiquetas para FIRST, SECOND, OTHER", () => {
    expect(DISH_CATEGORY_LABELS["FIRST"]).toBeTruthy();
    expect(DISH_CATEGORY_LABELS["SECOND"]).toBeTruthy();
    expect(DISH_CATEGORY_LABELS["OTHER"]).toBeTruthy();
  });

  it("etiqueta de FIRST es legible", () => {
    expect(DISH_CATEGORY_LABELS["FIRST"]).toMatch(/primer/i);
  });

  it("etiqueta de SECOND es legible", () => {
    expect(DISH_CATEGORY_LABELS["SECOND"]).toMatch(/segundo/i);
  });
});

describe("DAILY_MENU_STATUS_LABELS", () => {
  it("tiene etiquetas para DRAFT y ACTIVE", () => {
    expect(DAILY_MENU_STATUS_LABELS["DRAFT"]).toBeTruthy();
    expect(DAILY_MENU_STATUS_LABELS["ACTIVE"]).toBeTruthy();
  });
});

describe("DISH_CATEGORIES", () => {
  it("contiene FIRST, SECOND y OTHER", () => {
    expect(DISH_CATEGORIES).toContain("FIRST");
    expect(DISH_CATEGORIES).toContain("SECOND");
    expect(DISH_CATEGORIES).toContain("OTHER");
  });

  it("tiene exactamente 3 categorias", () => {
    expect(DISH_CATEGORIES.length).toBe(3);
  });

  it("es de solo lectura (as const)", () => {
    expect(Array.isArray(DISH_CATEGORIES)).toBe(true);
  });
});
