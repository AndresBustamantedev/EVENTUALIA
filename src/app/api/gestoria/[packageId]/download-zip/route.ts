/**
 * GET /api/gestoria/[packageId]/download-zip
 *
 * Descarga un ZIP con todos los PDFs de las facturas del paquete.
 * Solo incluye facturas que tienen archivo adjunto.
 * Requiere permiso suppliers:read.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { prisma } from "@/core/db/client";
import { readFile } from "@/core/storage/StorageProvider";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const JSZip = require("jszip");

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
): Promise<NextResponse> {
  try {
    await requirePermission("suppliers:read");
  } catch (e) {
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { packageId } = await params;

  // Cargar el paquete con sus facturas y archivos
  const pkg = await (prisma as any).gestoriaPackage.findUnique({
    where: { id: packageId },
    select: {
      year: true,
      quarter: true,
      description: true,
      items: {
        include: {
          invoice: {
            include: {
              storedFile: {
                select: { storageKey: true, originalName: true, mimeType: true },
              },
              bundle: {
                select: {
                  id: true,
                  bundleDate: true,
                  storedFile: {
                    select: { storageKey: true, originalName: true, mimeType: true },
                  },
                },
              },
              supplier: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!pkg) {
    return NextResponse.json({ error: "Paquete no encontrado." }, { status: 404 });
  }

  // Filtrar ítems que tienen archivo directo o bundle PDF
  const itemsWithFile = (pkg.items as any[]).filter(
    (item: any) => item.invoice?.storedFile || item.invoice?.bundle?.storedFile
  );

  if (itemsWithFile.length === 0) {
    return NextResponse.json(
      { error: "Ninguna factura de este paquete tiene PDF adjunto." },
      { status: 404 }
    );
  }

  const zip = new JSZip();
  // usedPaths: "SupplierFolder/filename.pdf" para evitar duplicados dentro de cada carpeta
  const usedPaths = new Set<string>();
  // Control de bundles ya añadidos (para no duplicar el mismo escáner)
  const addedBundleIds = new Set<string>();

  for (const item of itemsWithFile) {
    const inv = item.invoice;

    const supplierSlug = (inv.supplier?.name ?? "proveedor")
      .replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚñÑ ]/g, "_").trim().slice(0, 50);
    const folder = zip.folder(supplierSlug)!;

    // Caso 1: factura con PDF propio
    if (inv.storedFile) {
      let buf: Buffer;
      try { buf = await readFile(inv.storedFile.storageKey); }
      catch { continue; }

      const numSlug = (inv.invoiceNumber ?? "sin-num")
        .replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 30);
      const dateSlug = (inv.invoiceDate as Date).toISOString().split("T")[0];

      let name = `${numSlug}_${dateSlug}.pdf`;
      let counter = 2;
      while (usedPaths.has(`${supplierSlug}/${name}`)) {
        name = `${numSlug}_${dateSlug}_${counter++}.pdf`;
      }
      usedPaths.add(`${supplierSlug}/${name}`);
      folder.file(name, buf);
      continue;
    }

    // Caso 2: factura de bundle (el PDF es el escáner del lote)
    const bundle = inv.bundle;
    if (bundle?.storedFile && !addedBundleIds.has(bundle.id)) {
      let buf: Buffer;
      try { buf = await readFile(bundle.storedFile.storageKey); }
      catch { continue; }

      const dateSlug = bundle.bundleDate
        ? (bundle.bundleDate as Date).toISOString().split("T")[0]
        : (inv.invoiceDate as Date).toISOString().split("T")[0];

      let name = `escaner_${dateSlug}.pdf`;
      let counter = 2;
      while (usedPaths.has(`${supplierSlug}/${name}`)) {
        name = `escaner_${dateSlug}_${counter++}.pdf`;
      }
      usedPaths.add(`${supplierSlug}/${name}`);
      addedBundleIds.add(bundle.id);
      folder.file(name, buf);
    }
  }

  const zipBuffer: Buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  const quarterLabel = `T${pkg.quarter}-${pkg.year}`;
  const zipName = `facturas-gestoria-${quarterLabel}.zip`;

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Content-Length": zipBuffer.length.toString(),
      "Cache-Control": "private, no-store",
    },
  });
}
