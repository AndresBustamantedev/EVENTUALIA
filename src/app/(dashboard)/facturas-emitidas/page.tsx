import { redirect } from "next/navigation";
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { listIssuedInvoices } from "@/modules/issued-invoices/actions/issuedInvoices";
import { IssuedInvoicesClient } from "@/modules/issued-invoices/components/IssuedInvoicesClient";

export const metadata = { title: "Facturas emitidas — Cruz Blanca" };

export default async function IssuedInvoicesPage() {
  let actor: { role: string };
  try {
    actor = await requirePermission("suppliers:read");
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/");
    throw e;
  }
  const canWrite = actor.role === "ADMIN" || actor.role === "ENCARGADO";
  const invoices = await listIssuedInvoices();
  return <IssuedInvoicesClient invoices={invoices} canWrite={canWrite} />;
}
