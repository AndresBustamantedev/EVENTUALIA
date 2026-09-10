/**
 * Middleware de Next.js — primera línea de defensa.
 * Usa auth.config.ts (edge-compatible) en lugar de auth.ts para evitar
 * importar @node-rs/argon2 y Prisma en el Edge Runtime.
 */
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const { auth } = NextAuth(authConfig);

// Rutas que no requieren autenticación
const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/api/health",
  "/_next",
  "/favicon.ico",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export default auth((req: NextRequest & { auth: unknown }) => {
  const { pathname } = req.nextUrl;
  const session = req.auth as {
    user?: { mustChangePwd?: boolean };
  } | null;
  const isAuthenticated = !!session?.user;

  // Rutas públicas: siempre permitir
  if (isPublicPath(pathname)) {
    // Si ya está autenticado y va al login, redirigir al dashboard
    if (isAuthenticated && pathname === "/login") {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // Rutas protegidas: requieren sesión
  if (!isAuthenticated) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Si debe cambiar contraseña, redirigir (excepto si ya está ahí)
  if (
    session?.user?.mustChangePwd &&
    !pathname.startsWith("/change-password")
  ) {
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Aplica a todas las rutas excepto:
     * - Archivos estáticos de Next.js (_next/static, _next/image)
     * - Imágenes y fuentes
     */
    "/((?!_next/static|_next/image|images/|fonts/|favicon.ico).*)",
  ],
};
