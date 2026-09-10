import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/core/auth/session";
import { getIssuedInvoicePdfData } from "@/modules/issued-invoices/actions/issuedInvoices";
import { generateIssuedInvoicePdf } from "@/core/pdf/issuedInvoicePdf";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("suppliers:read");
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const data = await getIssuedInvoicePdfData(id);
  if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const buffer = await generateIssuedInvoicePdf(data);
  const filename = `factura-${data.invoiceNumber.replace(/[^A-Za-z0-9-]/g, "_")}.pdf`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
