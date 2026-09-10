/**
 * Servicio de auditoría.
 * Los registros son INMUTABLES: nunca se modifican ni eliminan.
 *
 * IMPORTANTE: nunca incluir en metadata:
 * - contraseñas (ni hash)
 * - cookies o tokens
 * - DNI/NIE, NAF
 * - contenido de documentos
 * - IBAN u otros datos financieros sensibles
 */
import { prisma } from "@/core/db/client";

interface LogOptions {
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  /** Contexto adicional SIN datos sensibles */
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export async function auditLog(options: LogOptions): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: options.actorId ?? null,
        action: options.action,
        targetType: options.targetType ?? null,
        targetId: options.targetId ?? null,
        metadata: options.metadata ?? null,
        ipAddress: options.ipAddress ?? null,
      },
    });
  } catch (error) {
    // El fallo de auditoría no debe interrumpir la operación principal,
    // pero sí debe ser visible en los logs de la aplicación.
    console.error("[AuditService] Error al escribir registro:", error);
  }
}
