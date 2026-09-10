/**
 * Configuración de Auth.js compatible con Edge Runtime.
 * NO importa módulos Node.js nativos (@node-rs/argon2, prisma, etc.)
 * Se usa en el middleware y como base para auth.ts (que añade los providers).
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 }, // 8 horas
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      // Al crear el token por primera vez (login)
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role;
        token.mustChangePwd = (user as { mustChangePwd?: boolean }).mustChangePwd;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.mustChangePwd = token.mustChangePwd as boolean;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
