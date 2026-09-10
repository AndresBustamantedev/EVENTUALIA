/**
 * Helper para obtener la sesión del usuario actual en Server Components
 * y Server Actions. Lanza un error si no hay sesión válida.
 */
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { hasPermission, type Permission } from "./permissions";

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: string;
  mustChangePwd: boolean;
};

/**
 * Obtiene la sesión actual. Redirige a /login si no existe.
 */
export async function requireSession(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session.user as SessionUser;
}

/**
 * Obtiene la sesión y comprueba un permiso.
 * Lanza ForbiddenError si el usuario no tiene el permiso.
 */
export async function requirePermission(
  permission: Permission
): Promise<SessionUser> {
  const user = await requireSession();
  if (!hasPermission(user.role, permission)) {
    throw new ForbiddenError(
      `El rol ${user.role} no tiene el permiso: ${permission}`
    );
  }
  return user;
}

/**
 * Error de autorización — devuelve 403 en Route Handlers
 * o puede capturarse en Server Actions para mostrar un mensaje.
 */
export class ForbiddenError extends Error {
  readonly statusCode = 403;
  constructor(message = "Acceso denegado") {
    super(message);
    this.name = "ForbiddenError";
  }
}
