import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import { listPackages } from "@/modules/gestoria/actions/packages";
import {
  QUARTER_LABELS,
  GESTORIA_STATUS_LABELS,
  type GestoriaPackageRow,
} from "@/modules/gestoria/types";
import { PackageFormToggle } from "@/modules/gestoria/components/PackageFormToggle";
import { PackageDeleteButton } from "@/modules/gestoria/components/PackageDeleteButton";

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT:     "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  SENT:      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  CONFIRMED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

function PackageCard({
  pkg, index, total, canWrite,
}: {
  pkg: GestoriaPackageRow;
  index: number;
  total: number;
  canWrite: boolean;
}) {
  const label = `${QUARTER_LABELS[pkg.quarter]} ${pkg.year}`;

  return (
    <div className="relative group">
      <Link
        href={`/gestoria/${pkg.id}`}
        className="block rounded-lg border p-4 hover:bg-muted/30 transition-colors pr-10"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{QUARTER_LABELS[pkg.quarter]} · {pkg.year}</span>
              {total > 1 && <span className="text-xs text-muted-foreground">Envío {index + 1}</span>}
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[pkg.status]}`}>
                {GESTORIA_STATUS_LABELS[pkg.status]}
              </span>
            </div>
            {pkg.description && (
              <p className="text-sm text-muted-foreground mt-0.5 truncate">{pkg.description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {pkg.itemCount} factura{pkg.itemCount !== 1 ? "s" : ""}
              {pkg.sentAt && ` · Enviado ${new Date(pkg.sentAt).toLocaleDateString("es-ES")}`}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-mono text-sm font-semibold">{formatEuros(pkg.totalInCents)}</p>
          </div>
        </div>
      </Link>

      {/* Delete button — absolute, top-right, only for admins */}
      {canWrite && (
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <PackageDeleteButton
            packageId={pkg.id}
            packageLabel={label}
            itemCount={pkg.itemCount}
          />
        </div>
      )}
    </div>
  );
}

export default async function GestoriaPage() {
  let actor: Awaited<ReturnType<typeof requirePermission>>;
  try {
    actor = await requirePermission("suppliers:read");
  } catch {
    redirect("/login");
  }

  const canWrite = actor.role === "ADMIN" || actor.role === "RRHH";
  const packages = await listPackages();

  // Agrupar por año
  const byYear = packages.reduce<Record<number, GestoriaPackageRow[]>>((acc, p) => {
    (acc[p.year] ??= []).push(p);
    return acc;
  }, {});

  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-6 px-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Gestoría</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Paquetes de facturas enviados a la gestora por trimestre
          </p>
        </div>
        {canWrite && <PackageFormToggle />}
      </div>

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
        <div className="space-y-8">
          {years.map((year) => (
            <div key={year}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                {year}
              </h2>
              <div className="space-y-2">
                {byYear[year].map((pkg, idx, arr) => (
                  <PackageCard
                    key={pkg.id}
                    pkg={pkg}
                    index={idx}
                    total={arr.length}
                    canWrite={canWrite}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
