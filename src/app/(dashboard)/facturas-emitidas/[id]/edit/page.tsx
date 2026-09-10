import { notFound, redirect } from "next/navigation";
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { getIssuedInvoice, updateIssuedInvoiceAction } from "@/modules/issued-invoices/actions/issuedInvoices";
import { IssuedInvoiceForm } from "@/modules/issued-invoices/components/IssuedInvoiceForm";

export const metadata = { title: "Editar factura — Cruz Blanca" };

interface Props { params: Promise<{ id: string }> }

export default async function EditIssuedInvoicePage({ params }: Props) {
  try {
    await requirePermission("suppliers:write");
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/");
    throw e;
  }
  const { id } = await params;
  const invoice = await getIssuedInvoice(id);
  if (!invoice) notFound();

  const boundAction = updateIssuedInvoiceAction.bind(null, id);
  return <IssuedInvoiceForm action={boundAction} initialData={invoice} mode="edit" />;
}
