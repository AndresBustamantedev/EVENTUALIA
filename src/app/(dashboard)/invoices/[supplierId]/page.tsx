/**
 * /invoices/[supplierId] — Vista de facturas de un proveedor
 * organizada por año → trimestre. Con drawer de subida completo.
 */
import { redirect } from "next/navigation";
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { getSupplier, listSuppliers, getOrCreateUnassignedSupplier } from "@/modules/suppliers/actions/suppliers";
import { listInvoices, createInvoiceAction } from "@/modules/suppliers/actions/invoices";
import { listBundles, createBundleAction } from "@/modules/suppliers/actions/bundles";
import { InvoiceSupplierPageClient } from "@/modules/suppliers/components/InvoiceSupplierPageClient";
import { BundleSection } from "@/modules/suppliers/components/BundleSection";
import { InvoiceForm } from "@/modules/suppliers/components/InvoiceForm";

interface PageProps {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<{ upload?: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { supplierId } = await params;
  try {
    const s = await getSupplier(supplierId);
    return { title: `${s.name} — Facturas` };
  } catch {
    return { title: "Facturas — Cruz Blanca" };
  }
}

export default async function InvoiceSupplierPage({ params, searchParams }: PageProps) {
  const { supplierId } = await params;
  const sp = await searchParams;

  let actor: { role: string };
  try {
    actor = await requirePermission("suppliers:read");
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/");
    throw e;
  }

  const canWrite = actor.role === "ADMIN" || actor.role === "ENCARGADO";

  let supplier;
  try {
    supplier = await getSupplier(supplierId);
  } catch {
    redirect("/invoices");
  }

  const unassignedId = await getOrCreateUnassignedSupplier();
  const isUnassigned = supplierId === unassignedId;

  const [invoices, bundles, allSuppliers] = await Promise.all([
    listInvoices(supplierId),
    canWrite && !isUnassigned ? listBundles(supplierId) : Promise.resolve([]),
    isUnassigned ? listSuppliers(true) : Promise.resolve([]),
  ]);

  // For reassignment view, only show active suppliers (not "Sin asignar" itself)
  const activeSuppliers = allSuppliers.filter(s => s.isActive);

  return (
    <InvoiceSupplierPageClient
      supplier={supplier}
      invoices={invoices}
      canWrite={canWrite}
      defaultOpen={sp.upload === "1"}
      isUnassigned={isUnassigned}
      allSuppliers={activeSuppliers}
      ScannerSlot={
        canWrite && !isUnassigned ? (
          <BundleSection
            supplierId={supplierId}
            bundles={bundles}
            canWrite={true}
          />
        ) : undefined
      }
      InvoiceSlot={
        canWrite && !isUnassigned ? (
          <InvoiceForm
            supplierId={supplierId}
            action={createInvoiceAction}
            bundles={bundles}
          />
        ) : undefined
      }
    />
  );
}
