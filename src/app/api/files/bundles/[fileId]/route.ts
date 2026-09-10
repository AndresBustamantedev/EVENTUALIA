/**
 * GET /api/files/bundles/[fileId]
 * Descarga autenticada de un PDF bundle.
 * Requiere suppliers:read y verifica que el StoredFile pertenece a un bundle.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/core/auth/session";
import { prisma } from "@/core/db/client";
import { readFile } from "@/core/storage/StorageProvider";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    await requirePermission("suppliers:read");
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { fileId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sf = await (prisma as any).storedFile.findUnique({
    where: { id: fileId },
    include: { invoiceBundles: { select: { id: true }, take: 1 } },
  });

  if (!sf || (sf.invoiceBundles as { id: string }[]).length === 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buf = await readFile(sf.storageKey as string);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": sf.mimeType as string,
      "Content-Disposition": `inline; filename="${encodeURIComponent(sf.originalName as string)}"`,
      "Content-Length": String(buf.length),
      "Cache-Control": "private, no-store",
    },
  });
}
