/**
 * Route handler: Descarga segura de PDFs de registro de jornada
 *
 * SEGURIDAD:
 * - Comprueba sesión y permiso hr:records:read antes de servir el archivo.
 * - Verifica que el storageKey existe en BD y pertenece a un TimeRecordPdf.
 * - Aplica path traversal guard en StorageProvider.readFile.
 * - Nunca expone rutas del sistema de ficheros al cliente.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { prisma } from "@/core/db/client";
import { readFile } from "@/core/storage/StorageProvider";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ storageKey: string }> }
): Promise<NextResponse> {
  // 1. Verificar sesión y permiso
  try {
    await requirePermission("hr:records:read");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
    }
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  // 2. Decodificar storageKey (viene URL-encoded)
  const { storageKey: encodedKey } = await params;
  const storageKey = decodeURIComponent(encodedKey);

  // 3. Verificar que la clave existe en BD y es un PDF de jornada activo
  const pdfRecord = await (
    (prisma as unknown as Record<string, unknown>)["timeRecordPdf"] as any
  ).findFirst({
    where: { storageKey, isCurrent: true },
    select: { id: true, storageKey: true },
  });

  if (!pdfRecord) {
    return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
  }

  // 4. Leer el archivo del almacenamiento (con path traversal guard interno)
  let buffer: Buffer;
  try {
    buffer = await readFile(storageKey);
  } catch {
    return NextResponse.json({ error: "Error al leer el documento." }, { status: 500 });
  }

  // 5. Devolver con cabeceras de descarga seguras
  const filename = storageKey.split("/").pop() ?? "registro_jornada.pdf";

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
