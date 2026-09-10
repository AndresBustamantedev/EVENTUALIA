/**
 * Route handler: Descarga autenticada de PDFs de facturas de proveedor.
 *
 * SEGURIDAD:
 * - Comprueba sesión y permiso suppliers:read.
 * - Verifica que la factura existe y el storedFile pertenece a ella.
 * - No expone rutas internas del sistema de ficheros.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { prisma } from "@/core/db/client";
import { readFile } from "@/core/storage/StorageProvider";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
): Promise<NextResponse> {
  try {
    await requirePermission("suppliers:read");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
    }
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { fileId } = await params;

  // Verificar que el StoredFile existe y está vinculado a una factura
  const sf = await (prisma as any).storedFile.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      storageKey: true,
      originalName: true,
      mimeType: true,
      deletedAt: true,
      invoices: { select: { id: true }, take: 1 },
    },
  });

  if (!sf || sf.deletedAt || sf.invoices.length === 0) {
    return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(sf.storageKey);
  } catch {
    return NextResponse.json({ error: "Error al leer el archivo." }, { status: 500 });
  }

  const disposition = `inline; filename="${encodeURIComponent(sf.originalName)}"`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": sf.mimeType,
      "Content-Disposition": disposition,
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
