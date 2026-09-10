/**
 * Tests de utilidades (fechas, dinero).
 */
import { describe, it, expect } from "vitest";
import { formatCents } from "@/lib/utils";

describe("formatCents", () => {
  it("formatea 0 céntimos", () => {
    expect(formatCents(0)).toContain("0");
  });

  it("formatea 1250 → 12,50 €", () => {
    const result = formatCents(1250);
    expect(result).toContain("12");
    expect(result).toContain("50");
    expect(result).toContain("€");
  });

  it("formatea 100 → 1,00 €", () => {
    const result = formatCents(100);
    expect(result).toContain("1");
    expect(result).toContain("€");
  });

  it("formatea 999 → 9,99 €", () => {
    const result = formatCents(999);
    expect(result).toContain("9");
    expect(result).toContain("99");
  });
});
