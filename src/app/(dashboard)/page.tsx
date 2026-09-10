import { requireSession } from "@/core/auth/session";
import { hasPermission } from "@/core/auth/permissions";
import Link from "next/link";

interface ModuleCard {
  href: string;
  title: string;
  description: string;
  badge?: string;
  available: boolean;
}

export default async function DashboardPage() {
  const user = await requireSession();

  const modules: ModuleCard[] = [
    {
      href: "/hr",
      title: "Recursos Humanos",
      description:
        "Empleados, contratos, horarios, registro de jornada y documentos laborales.",
      available: hasPermission(user.role, "hr:employees:read"),
    },
    {
      href: "/hr/schedules",
      title: "Horarios",
      description:
        "Consulta los horarios semanales de todos los empleados.",
      available:
        hasPermission(user.role, "hr:schedules:read") &&
        !hasPermission(user.role, "hr:employees:read"), // solo visible aparte para ENCARGADO
    },
    {
      href: "/menu",
      title: "Menú del día",
      description:
        "Crea y gestiona el menú diario. Genera los tres documentos PDF.",
      available: hasPermission(user.role, "menu:read"),
    },
    {
      href: "/suppliers",
      title: "Proveedores y facturas",
      description: "Gestión de proveedores y registro de facturas.",
      badge: "Próximamente",
      available: false,
    },
  ].filter((m) => m.available || m.badge);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">
          Bienvenido, {user.name?.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground mt-1">
          Panel de gestión — Cruz Blanca
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {modules.map((mod) =>
          mod.badge ? (
            <div
              key={mod.href}
              className="rounded-xl border border-border bg-card p-5 opacity-60 cursor-not-allowed"
            >
              <div className="flex items-start justify-between mb-2">
                <h2 className="font-medium text-foreground">{mod.title}</h2>
                <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5 shrink-0 ml-2">
                  {mod.badge}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{mod.description}</p>
            </div>
          ) : (
            <Link
              key={mod.href}
              href={mod.href}
              className="rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all group"
            >
              <h2 className="font-medium text-foreground group-hover:text-primary transition-colors mb-2">
                {mod.title}
              </h2>
              <p className="text-sm text-muted-foreground">{mod.description}</p>
            </Link>
          )
        )}
      </div>
    </div>
  );
}
