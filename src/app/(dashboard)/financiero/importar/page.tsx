import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import { listSuppliers, getOrCreateUnassignedSupplier } from "@/modules/suppliers/actions/suppliers";
import { BulkImportPanel } from "@/modules/suppliers/components/BulkImportPanel";

export default async function ImportarFacturasPage() {
  try {
    await requirePermission("suppliers:write");
  } catch {
    redirect("/login");
  }

  const [suppliers, unassignedSupplierId] = await Promise.all([
    listSuppliers(),
    getOrCreateUnassignedSupplier(),
  ]);

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Importar facturas PDF</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Sube hasta 50 facturas digitales a la vez — la IA extrae los campos automáticamente
          </p>
        </div>
        <Link
          href="/financiero"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Volver a Facturas
        </Link>
      </div>

      <BulkImportPanel suppliers={suppliers} unassignedSupplierId={unassignedSupplierId} />
    </div>
  );
}
