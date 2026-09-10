import { notFound, redirect } from "next/navigation";
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { getIssuedInvoice, createRectificativaAction } from "@/modules/issued-invoices/actions/issuedInvoices";
import { IssuedInvoiceForm } from "@/modules/issued-invoices/components/IssuedInvoiceForm";

export const metadata = { title: "Nueva rectificativa — Cruz Blanca" };

interface Props { params: Promise<{ id: string }> }

export default async function RectificativaPage({ params }: Props) {
  try {
    await requirePermission("suppliers:write");
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/");
    throw e;
  }
  const { id } = await params;
  const original = await getIssuedInvoice(id);
  if (!original || original.status !== "ACTIVE") notFound();

  const boundAction = createRectificativaAction.bind(null, id);
  return (
    <IssuedInvoiceForm
      action={boundAction}
      initialData={original}
      mode="rectificativa"
      originalNumber={original.invoiceNumber}
    />
  );
}
