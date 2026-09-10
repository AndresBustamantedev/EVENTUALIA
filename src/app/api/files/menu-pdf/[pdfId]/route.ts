/**
 * Route handler — Descarga de PDF de menú del día
 *
 * GET /api/files/menu-pdf/[pdfId]
 *
 * Seguridad:
 *  - Requiere sesión autenticada + permiso menu:read
 *  - El ID del PDF es opaco (UUID); la clave de almacenamiento nunca se expone
 *  - Solo devuelve PDFs con isCurrent = true para proteger versiones antiguas
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/core/auth/session";
import { prisma } from "@/core/db/client";
import { readFile } from "@/core/storage/StorageProvider";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ pdfId: string }> }
) {
  // Comprobar sesión y permiso
  try {
    await requirePermission("menu:read");
  } catch {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { pdfId } = await params;
  if (!pdfId) {
    return NextResponse.json({ error: "ID de PDF requerido." }, { status: 400 });
  }

  const menuPdfModel = (prisma as unknown as Record<string, unknown>)["menuPdf"] as any;
  const pdf = await menuPdfModel.findUnique({
    where: { id: pdfId },
    select: { id: true, storageKey: true, isCurrent: true, menuId: true },
  });

  if (!pdf) {
    return NextResponse.json({ error: "PDF no encontrado." }, { status: 404 });
  }

  // Solo permitir descarga de PDFs actuales (evita fugas de versiones antiguas)
  if (!pdf.isCurrent) {
    return NextResponse.json({ error: "PDF no disponible." }, { status: 410 });
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = await readFile(pdf.storageKey);
  } catch {
    return NextResponse.json(
      { error: "Error al recuperar el archivo." },
      { status: 500 }
    );
  }

  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="menu_${pdf.menuId}.pdf"`,
      "Content-Length": String(fileBuffer.length),
      "Cache-Control": "private, no-store",
    },
  });
}
