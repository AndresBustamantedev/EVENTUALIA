import { redirect } from "next/navigation";
import { requirePermission } from "@/core/auth/session";
import { listPackages } from "@/modules/gestoria/actions/packages";
import type { GestoriaPackageRow } from "@/modules/gestoria/types";
import { PackageFormToggle } from "@/modules/gestoria/components/PackageFormToggle";
import { GestoriaYearAccordion } from "@/modules/gestoria/components/GestoriaYearAccordion";

export default async function GestoriaPage() {
  let actor: Awaited<ReturnType<typeof requirePermission>>;
  try {
    actor = await requirePermission("gestoria:read");
  } catch {
    redirect("/login");
  }

  const canWrite = actor.role === "ADMIN" || actor.role === "RRHH";
  const isGestoria = actor.role === "GESTORIA";
  const allPackages = await listPackages();

  // La gestora solo ve paquetes enviados o confirmados (no borradores)
  const packages = isGestoria
    ? allPackages.filter(p => p.status !== "DRAFT")
    : allPackages;

  const sentCount = packages.filter(p => p.status === "SENT").length;

  // Agrupar por año (más reciente primero)
  const byYear = packages.reduce<Record<number, GestoriaPackageRow[]>>((acc, p) => {
    (acc[p.year] ??= []).push(p);
    return acc;
  }, {});
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6 px-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Gestoría</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Paquetes de facturas enviados a la gestora por trimestre
          </p>
        </div>
        {canWrite && <PackageFormToggle />}
      </div>

      {/* ── Banner paquetes pendientes de confirmar (solo para la gestora) ── */}
      {sentCount > 0 && !canWrite && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 px-4 py-3">
          <span className="text-blue-500 text-lg leading-none mt-0.5">📬</span>
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
              {sentCount === 1
                ? "Tienes 1 paquete pendiente de confirmar"
                : `Tienes ${sentCount} paquetes pendientes de confirmar`}
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
              Revisa el detalle y pulsa "Recibido" cuando hayas procesado las facturas.
            </p>
          </div>
        </div>
      )}

      {packages.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground">Aún no hay paquetes de gestoría.</p>
          {canWrite && (
            <p className="text-sm text-muted-foreground mt-1">
              Crea el primero con el botón superior.
            </p>
          )}
        </div>
      ) : (
        <GestoriaYearAccordion byYear={byYear} years={years} canWrite={canWrite} />
      )}
    </div>
  );
}
