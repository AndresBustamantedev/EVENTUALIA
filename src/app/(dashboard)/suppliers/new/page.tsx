import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { redirect } from "next/navigation";
import { createSupplierAction, listTags } from "@/modules/suppliers/actions/suppliers";
import { SupplierForm } from "@/modules/suppliers/components/SupplierForm";

export const metadata = { title: "Nuevo proveedor — Cruz Blanca" };

export default async function NewSupplierPage() {
  try {
    await requirePermission("suppliers:write");
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/suppliers");
    throw e;
  }

  const allTags = await listTags();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Nuevo proveedor</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Rellena los datos del proveedor. Solo el nombre es obligatorio.
        </p>
      </div>
      <SupplierForm mode="create" action={createSupplierAction} allTags={allTags} />
    </div>
  );
}
