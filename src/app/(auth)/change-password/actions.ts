"use server";

import { z } from "zod";
import { hash } from "@node-rs/argon2";
import { prisma } from "@/core/db/client";
import { requireSession } from "@/core/auth/session";
import { auditLog } from "@/core/audit/AuditService";
import { AUDIT_PASSWORD_CHANGED } from "@/core/audit/events";
import { verify } from "@node-rs/argon2";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "La contraseña actual es obligatoria"),
    newPassword: z
      .string()
      .min(12, "La nueva contraseña debe tener al menos 12 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export type ChangePasswordState = {
  error?: string;
  success?: boolean;
};

export async function changePasswordAction(
  _prevState: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const session = await requireSession();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message;
    return { error: firstError ?? "Datos inválidos" };
  }

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return { error: "Usuario no encontrado" };

  // Verificar contraseña actual
  let currentValid = false;
  try {
    currentValid = await verify(user.passwordHash, parsed.data.currentPassword);
  } catch {
    currentValid = false;
  }

  if (!currentValid) {
    return { error: "La contraseña actual es incorrecta" };
  }

  // No permitir la misma contraseña
  let samePassword = false;
  try {
    samePassword = await verify(user.passwordHash, parsed.data.newPassword);
  } catch {
    samePassword = false;
  }
  if (samePassword) {
    return { error: "La nueva contraseña debe ser diferente a la actual" };
  }

  // Generar hash de la nueva contraseña
  const newHash = await hash(parsed.data.newPassword, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHash,
      mustChangePwd: false,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });

  await auditLog({
    action: AUDIT_PASSWORD_CHANGED,
    actorId: user.id,
    targetType: "user",
    targetId: user.id,
  });

  return { success: true };
}
