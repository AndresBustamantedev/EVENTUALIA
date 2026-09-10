/**
 * Mapa de permisos por rol y función de comprobación.
 * La autorización SIEMPRE se comprueba en el servidor.
 * Ocultar botones en la UI es cosmético, no seguridad.
 */

// Todos los permisos disponibles en el sistema
export const ALL_PERMISSIONS = [
  // Administración
  "users:manage",
  "system:settings",
  "system:audit",
  // RRHH — empleados
  "hr:employees:read",
  "hr:employees:write",
  // RRHH — contratos
  "hr:contracts:read",
  "hr:contracts:write",
  // RRHH — horarios
  "hr:schedules:read",
  "hr:schedules:write",
  // RRHH — registros de jornada
  "hr:records:read",
  "hr:records:write",
  // RRHH — documentos laborales
  "hr:documents:read",
  "hr:documents:write",
  // Menú
  "menu:read",
  "menu:write",
  "menu:pdf:generate",
  // Proveedores
  "suppliers:read",
  "suppliers:write",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

// Permisos por rol
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  ADMIN: [...ALL_PERMISSIONS],
  RRHH: [
    "hr:employees:read",
    "hr:employees:write",
    "hr:contracts:read",
    "hr:contracts:write",
    "hr:schedules:read",
    "hr:schedules:write",
    "hr:records:read",
    "hr:records:write",
    "hr:documents:read",
    "hr:documents:write",
    "menu:read",
    "menu:write",
    "menu:pdf:generate",
  ],
  ENCARGADO: [
    "suppliers:read",
    "hr:schedules:read", // Horarios de todos los empleados (nombre, días, horas)
    "menu:read",
    "menu:write",
    "menu:pdf:generate",
  ],
  COCINA: [
    "menu:read", // Solo menú del día vigente
  ],
};

/**
 * Comprueba si un rol tiene un permiso concreto.
 * Usar en Server Actions, Route Handlers y Server Components.
 */
export function hasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes(permission);
}

/**
 * Comprueba si un rol tiene TODOS los permisos indicados.
 */
export function hasAllPermissions(
  role: string,
  permissions: Permission[]
): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

/**
 * Comprueba si un rol tiene AL MENOS UNO de los permisos indicados.
 */
export function hasAnyPermission(
  role: string,
  permissions: Permission[]
): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

/**
 * Devuelve todos los permisos de un rol.
 */
export function getPermissionsForRole(role: string): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
