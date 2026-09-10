/**
 * Configuración central de Auth.js v5 — solo para uso en Server Components y API Routes.
 * El middleware usa auth.config.ts (edge-compatible, sin Argon2 ni Prisma).
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { verify } from "@node-rs/argon2";
import { prisma } from "@/core/db/client";
import { auditLog } from "@/core/audit/AuditService";
import {
  AUDIT_USER_LOGIN,
  AUDIT_USER_LOGIN_FAILED,
  AUDIT_USER_LOGIN_LOCKED,
} from "@/core/audit/events";
import { authConfig } from "./auth.config";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const LOCKOUT_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Credenciales",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials, request) {
        // Validar formato básico
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const ip =
          request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          request?.headers?.get("x-real-ip") ??
          null;

        // Buscar usuario con su rol
        const user = await prisma.user.findUnique({
          where: { email },
          include: { role: true },
        });

        // Usuario no encontrado o inactivo
        // Usar mensaje genérico para no revelar si el email existe
        if (!user || !user.isActive) {
          await auditLog({
            action: AUDIT_USER_LOGIN_FAILED,
            metadata: { reason: "not_found_or_inactive" },
            ipAddress: ip ?? undefined,
          });
          return null;
        }

        // Comprobar bloqueo por intentos fallidos
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await auditLog({
            action: AUDIT_USER_LOGIN_LOCKED,
            actorId: user.id,
            metadata: {
              lockedUntil: user.lockedUntil.toISOString(),
            },
            ipAddress: ip ?? undefined,
          });
          return null;
        }

        // Verificar contraseña con Argon2id
        let passwordValid = false;
        try {
          passwordValid = await verify(user.passwordHash, password);
        } catch {
          // Error al verificar — tratar como fallo de autenticación
          passwordValid = false;
        }

        if (!passwordValid) {
          // Incrementar contador de intentos fallidos
          const newAttempts = user.failedAttempts + 1;
          const shouldLock = newAttempts >= LOCKOUT_ATTEMPTS;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedAttempts: newAttempts,
              lockedUntil: shouldLock
                ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
                : null,
            },
          });

          await auditLog({
            action: AUDIT_USER_LOGIN_FAILED,
            actorId: user.id,
            metadata: {
              attempt: newAttempts,
              locked: shouldLock,
            },
            ipAddress: ip ?? undefined,
          });
          return null;
        }

        // Login correcto: resetear intentos y registrar acceso
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
          },
        });

        await auditLog({
          action: AUDIT_USER_LOGIN,
          actorId: user.id,
          metadata: { role: user.role.name },
          ipAddress: ip ?? undefined,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role.name,
          mustChangePwd: user.mustChangePwd,
        };
      },
    }),
  ],
});
