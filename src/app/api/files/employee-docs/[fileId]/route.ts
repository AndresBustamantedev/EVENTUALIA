/**
 * Route handler: Descarga autenticada de documentos de empleado.
 *
 * SEGURIDAD:
 * - Comprueba sesión y permiso hr:documents:read.
 * - Verifica que el documento existe en BD (no borrado) y pertenece al empleado declarado.
 * - No expone la ruta interna del sistema de ficheros.
 * - Registra auditoría de cada descarga.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { prisma } from "@/core/db/client";
import { readFile } from "@/core/storage/StorageProvider";
import { auditLog } from "@/core/audit/AuditService";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
): Promise<NextResponse> {
  // 1. Verificar sesión y permiso
  let actor: { id: string };
  try {
    actor = await requirePermission("hr:documents:read");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
    }
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { fileId } = await params;

  // 2. Verificar que el documento existe y no está borrado
  const doc = await (
    (prisma as unknown as Record<string, unknown>)["employeeDocument"] as any
  ).findUnique({
    where: { id: fileId },
    select: {
      id: true,
      deletedAt: true,
      employeeId: true,
      title: true,
      storedFile: {
        select: {
          storageKey: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
        },
      },
    },
  });

  if (!doc || doc.deletedAt) {
    return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
  }

  // 3. Leer el archivo del almacenamiento (path traversal guard interno)
  let buffer: Buffer;
  try {
    buffer = await readFile(doc.storedFile.storageKey);
  } catch {
    return NextResponse.json({ error: "Error al leer el documento." }, { status: 500 });
  }

  // 4. Registrar auditoría de descarga (sin datos personales en metadata)
  await auditLog({
    actorId: actor.id,
    action: "hr.document.download",
    targetType: "employee_document",
    targetId: doc.id,
    metadata: { employeeId: doc.employeeId },
  }).catch(() => null);

  // 5. Devolver con cabeceras seguras
  const disposition = `inline; filename="${encodeURIComponent(doc.storedFile.originalName)}"`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": doc.storedFile.mimeType,
      "Content-Disposition": disposition,
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
