import { redirect } from "next/navigation";
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { createIssuedInvoiceAction } from "@/modules/issued-invoices/actions/issuedInvoices";
import { IssuedInvoiceForm } from "@/modules/issued-invoices/components/IssuedInvoiceForm";

export const metadata = { title: "Nueva factura emitida — Cruz Blanca" };

export default async function NewIssuedInvoicePage() {
  try {
    await requirePermission("suppliers:write");
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/");
    throw e;
  }
  return <IssuedInvoiceForm action={createIssuedInvoiceAction} mode="create" />;
}
