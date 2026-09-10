/**
 * Tests de la lógica de permisos RBAC.
 * No requieren base de datos ni servidor.
 */
import { describe, it, expect } from "vitest";
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  getPermissionsForRole,
} from "@/core/auth/permissions";

describe("hasPermission", () => {
  // ── ADMIN ─────────────────────────────────────────────────
  it("ADMIN puede gestionar usuarios", () => {
    expect(hasPermission("ADMIN", "users:manage")).toBe(true);
  });

  it("ADMIN puede leer empleados", () => {
    expect(hasPermission("ADMIN", "hr:employees:read")).toBe(true);
  });

  it("ADMIN puede leer el menú", () => {
    expect(hasPermission("ADMIN", "menu:read")).toBe(true);
  });

  // ── RRHH ─────────────────────────────────────────────────
  it("RRHH puede leer y editar empleados", () => {
    expect(hasPermission("RRHH", "hr:employees:read")).toBe(true);
    expect(hasPermission("RRHH", "hr:employees:write")).toBe(true);
  });

  it("RRHH NO puede gestionar usuarios del sistema", () => {
    expect(hasPermission("RRHH", "users:manage")).toBe(false);
  });

  it("RRHH NO puede acceder a configuración del sistema", () => {
    expect(hasPermission("RRHH", "system:settings")).toBe(false);
  });

  // ── ENCARGADO ─────────────────────────────────────────────
  it("ENCARGADO puede ver horarios de todos los empleados", () => {
    expect(hasPermission("ENCARGADO", "hr:schedules:read")).toBe(true);
  });

  it("ENCARGADO puede editar el menú", () => {
    expect(hasPermission("ENCARGADO", "menu:write")).toBe(true);
  });

  it("ENCARGADO puede generar PDFs del menú", () => {
    expect(hasPermission("ENCARGADO", "menu:pdf:generate")).toBe(true);
  });

  it("ENCARGADO NO puede leer fichas de empleados", () => {
    expect(hasPermission("ENCARGADO", "hr:employees:read")).toBe(false);
  });

  it("ENCARGADO NO puede leer contratos", () => {
    expect(hasPermission("ENCARGADO", "hr:contracts:read")).toBe(false);
  });

  it("ENCARGADO NO puede leer documentos laborales", () => {
    expect(hasPermission("ENCARGADO", "hr:documents:read")).toBe(false);
  });

  it("ENCARGADO NO puede leer registros de jornada", () => {
    expect(hasPermission("ENCARGADO", "hr:records:read")).toBe(false);
  });

  it("ENCARGADO NO puede gestionar usuarios", () => {
    expect(hasPermission("ENCARGADO", "users:manage")).toBe(false);
  });

  // ── COCINA ────────────────────────────────────────────────
  it("COCINA puede leer el menú", () => {
    expect(hasPermission("COCINA", "menu:read")).toBe(true);
  });

  it("COCINA NO puede editar el menú", () => {
    expect(hasPermission("COCINA", "menu:write")).toBe(false);
  });

  it("COCINA NO puede acceder a RRHH de ninguna manera", () => {
    expect(hasPermission("COCINA", "hr:employees:read")).toBe(false);
    expect(hasPermission("COCINA", "hr:schedules:read")).toBe(false);
    expect(hasPermission("COCINA", "hr:documents:read")).toBe(false);
    expect(hasPermission("COCINA", "hr:records:read")).toBe(false);
  });

  it("COCINA NO puede gestionar usuarios", () => {
    expect(hasPermission("COCINA", "users:manage")).toBe(false);
  });

  // ── ROL INEXISTENTE ───────────────────────────────────────
  it("Rol inexistente no tiene ningún permiso", () => {
    expect(hasPermission("UNKNOWN", "menu:read")).toBe(false);
    expect(hasPermission("", "menu:read")).toBe(false);
  });
});

describe("hasAllPermissions", () => {
  it("ADMIN tiene todos los permisos de RRHH y menú", () => {
    expect(
      hasAllPermissions("ADMIN", [
        "hr:employees:read",
        "hr:employees:write",
        "menu:read",
        "menu:write",
      ])
    ).toBe(true);
  });

  it("ENCARGADO no tiene todos los permisos de RRHH", () => {
    expect(
      hasAllPermissions("ENCARGADO", [
        "hr:schedules:read",
        "hr:employees:read",
      ])
    ).toBe(false);
  });
});

describe("hasAnyPermission", () => {
  it("COCINA tiene al menos un permiso de menú", () => {
    expect(
      hasAnyPermission("COCINA", ["menu:read", "menu:write"])
    ).toBe(true);
  });

  it("COCINA no tiene ningún permiso de RRHH", () => {
    expect(
      hasAnyPermission("COCINA", [
        "hr:employees:read",
        "hr:employees:write",
        "hr:schedules:read",
      ])
    ).toBe(false);
  });
});

describe("getPermissionsForRole", () => {
  it("COCINA solo tiene menu:read", () => {
    const perms = getPermissionsForRole("COCINA");
    expect(perms).toContain("menu:read");
    expect(perms).not.toContain("menu:write");
    expect(perms).not.toContain("hr:employees:read");
  });

  it("Rol inexistente devuelve array vacío", () => {
    expect(getPermissionsForRole("FANTASMA")).toEqual([]);
  });
});
