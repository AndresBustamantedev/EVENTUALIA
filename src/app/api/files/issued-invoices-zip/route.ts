/**
 * GET /api/files/issued-invoices-zip?year=2026&quarter=3&status=ACTIVE
 * Genera un ZIP con los PDFs de las facturas emitidas del trimestre indicado.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/core/auth/session";
import { prisma } from "@/core/db/client";
import { getIssuedInvoicePdfData } from "@/modules/issued-invoices/actions/issuedInvoices";
import { generateIssuedInvoicePdf } from "@/core/pdf/issuedInvoicePdf";
import JSZip from "jszip";

function getQuarterDateRange(year: number, quarter: number): { gte: Date; lte: Date } {
  const startMonth = (quarter - 1) * 3;
  const gte = new Date(year, startMonth, 1);
  const lte = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);
  return { gte, lte };
}

export async function GET(req: Request) {
  try {
    await requirePermission("suppliers:read");
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? "", 10);
  const quarter = parseInt(searchParams.get("quarter") ?? "", 10);
  const statusParam = searchParams.get("status") ?? "ACTIVE";

  if (isNaN(year) || isNaN(quarter) || quarter < 1 || quarter > 4) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  const { gte, lte } = getQuarterDateRange(year, quarter);

  const where: Record<string, unknown> = { issueDate: { gte, lte } };
  if (statusParam !== "ALL") where.status = statusParam;

  const invoices = await (prisma as any).issuedInvoice.findMany({
    where,
    select: { id: true, invoiceNumber: true },
    orderBy: { issueDate: "asc" },
  });

  if (invoices.length === 0) {
    return NextResponse.json({ error: "No hay facturas en este período" }, { status: 404 });
  }

  const zip = new JSZip();

  for (const inv of invoices) {
    const data = await getIssuedInvoicePdfData(inv.id);
    if (!data) continue;
    const pdfBuffer = await generateIssuedInvoicePdf(data);
    zip.file(`factura-${inv.invoiceNumber}.pdf`, pdfBuffer);
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  return new NextResponse(zipBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="facturas-${year}-T${quarter}.zip"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
