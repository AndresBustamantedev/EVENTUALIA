import { notFound, redirect } from "next/navigation";
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { getIssuedInvoice } from "@/modules/issued-invoices/actions/issuedInvoices";
import { IssuedInvoiceDetail } from "@/modules/issued-invoices/components/IssuedInvoiceDetail";

export const metadata = { title: "Factura emitida — Cruz Blanca" };

interface Props { params: Promise<{ id: string }> }

export default async function IssuedInvoicePage({ params }: Props) {
  let actor: { role: string };
  try {
    actor = await requirePermission("suppliers:read");
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/");
    throw e;
  }
  const { id } = await params;
  const invoice = await getIssuedInvoice(id);
  if (!invoice) notFound();
  const canWrite = actor.role === "ADMIN" || actor.role === "ENCARGADO";
  return <IssuedInvoiceDetail invoice={invoice} canWrite={canWrite} />;
}
