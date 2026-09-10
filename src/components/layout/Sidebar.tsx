import Link from "next/link";
import { hasPermission, type Permission } from "@/core/auth/permissions";

// ── Tipos ─────────────────────────────────────────────────────

interface NavItem {
  kind: "link";
  href: string;
  label: string;
  permission: Permission;
  exact?: boolean;   // activar solo si la ruta coincide exactamente
}

interface NavSection {
  kind: "section";
  label: string;
  permission?: Permission;  // ocultar sección si no tiene el permiso
}

type NavEntry = NavItem | NavSection;

// ── Definición de la navegación ───────────────────────────────

const NAV: NavEntry[] = [
  // ── Personal ──────────────────────────────────────────
  { kind: "section", label: "Personal",  permission: "hr:employees:read" },
  { kind: "link", href: "/hr",           label: "RRHH",        permission: "hr:employees:read", exact: true },
  { kind: "link", href: "/hr/schedules", label: "Horarios",    permission: "hr:schedules:read" },
  { kind: "link", href: "/menu",         label: "Menú del día", permission: "menu:read" },

  // ── Compras ───────────────────────────────────────────
  { kind: "section", label: "Compras",   permission: "suppliers:read" },
  { kind: "link", href: "/suppliers",    label: "Proveedores", permission: "suppliers:read" },

  // ── Financiero ────────────────────────────────────────
  { kind: "section", label: "Financiero", permission: "suppliers:read" },
  { kind: "link", href: "/invoices",     label: "Facturas",       permission: "suppliers:read" },
  { kind: "link", href: "/gestoria",     label: "Gestoría",       permission: "suppliers:read" },
  { kind: "link", href: "/financiero",   label: "Análisis",       permission: "suppliers:read", exact: true },
  { kind: "link", href: "/financiero/reconciliacion", label: "Reconciliación", permission: "suppliers:read" },
  { kind: "link", href: "/facturas-emitidas", label: "Fact. emitidas", permission: "suppliers:read" },

  // ── Admin ─────────────────────────────────────────────
  { kind: "section", label: "Sistema",   permission: "system:settings" },
  { kind: "link", href: "/admin/settings", label: "Configuración", permission: "system:settings" },
];

// ── Componente ────────────────────────────────────────────────

interface SidebarProps {
  role: string;
  currentPath: string;
}

export function Sidebar({ role, currentPath }: SidebarProps) {
  // Pre-calcular permisos para evitar múltiples llamadas
  const can = (permission: Permission) => hasPermission(role, permission);

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-card flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-border">
        <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center shrink-0">
          <span className="text-white text-sm font-bold">CB</span>
        </div>
        <span className="text-sm font-semibold leading-tight">
          Cruz Blanca
          <br />
          <span className="text-muted-foreground font-normal">Gestión</span>
        </span>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-2 py-4 overflow-y-auto space-y-0.5">
        {/* Inicio siempre visible */}
        <Link
          href="/"
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
            currentPath === "/"
              ? "bg-primary/10 text-primary font-medium"
              : "text-foreground hover:bg-muted"
          }`}
        >
          Inicio
        </Link>

        {NAV.map((entry, i) => {
          if (entry.kind === "section") {
            // Ocultar sección si el usuario no tiene permiso
            if (entry.permission && !can(entry.permission)) return null;
            return (
              <p key={`section-${i}`}
                className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {entry.label}
              </p>
            );
          }

          // Link: filtrar por permiso
          if (!can(entry.permission)) return null;

          const isActive = entry.exact
            ? currentPath === entry.href
            : currentPath === entry.href || currentPath.startsWith(entry.href + "/");

          return (
            <Link
              key={entry.href}
              href={entry.href}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              {entry.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <p className="text-xs text-muted-foreground">
          Rol: <span className="font-medium text-foreground">{role}</span>
        </p>
      </div>
    </aside>
  );
}
