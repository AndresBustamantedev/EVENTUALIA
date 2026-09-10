/**
 * Página: Lista de proveedores
 * Acceso: suppliers:read (ADMIN y quien tenga el permiso)
 */
import Link from "next/link";
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { redirect } from "next/navigation";
import { listSuppliers, listTags } from "@/modules/suppliers/actions/suppliers";
import { listInvoices } from "@/modules/suppliers/actions/invoices";
import type { SupplierBranch } from "@/modules/suppliers/types";

export const metadata = { title: "Proveedores — Cruz Blanca" };

const BRANCH_LABELS: Record<SupplierBranch, { label: string; icon: string; color: string }> = {
  RESTAURANT:   { label: "Restaurante",  icon: "🍽️", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  CONSTRUCTION: { label: "Construcción", icon: "🏗️", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  BOTH:         { label: "Ambas ramas",  icon: "🔄", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
};

interface PageProps {
  searchParams: Promise<{ inactive?: string; branch?: string; tag?: string; alert?: string }>;
}

export default async function SuppliersPage({ searchParams }: PageProps) {
  const params = await searchParams;

  let actor: { role: string };
  try {
    actor = await requirePermission("suppliers:read");
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/");
    throw e;
  }

  const showAll = params.inactive === "1";
  const alertFilter = params.alert ?? "";
  const branchFilter = (params.branch ?? "ALL") as SupplierBranch | "ALL";
  const tagFilter = params.tag ?? "";

  const needsInvoices = alertFilter === "no_recent_invoice";
  const [allSuppliers, allTags, allInvoices] = await Promise.all([
    listSuppliers(!showAll),
    listTags(),
    needsInvoices ? listInvoices() : Promise.resolve([]),
  ]);

  // Alert filter
  let suppliers = allSuppliers.filter(s => {
    if (branchFilter !== "ALL" && s.branch !== branchFilter) return false;
    if (tagFilter && !s.tags.some(t => t.id === tagFilter)) return false;
    return true;
  });

  if (alertFilter === "no_cif") {
    suppliers = suppliers.filter(s => s.isActive && (!s.taxId || s.taxId.trim() === ""));
  } else if (alertFilter === "no_recent_invoice") {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const recentSupIds = new Set(
      (allInvoices as any[]).filter(i => new Date(i.invoiceDate) >= ninetyDaysAgo).map(i => i.supplierId)
    );
    suppliers = suppliers.filter(s => s.isActive && !recentSupIds.has(s.id));
  }

  const canWrite = actor.role === "ADMIN" || actor.role === "RRHH";

  /** Build a URL preserving existing params but overriding the given key */
  function buildUrl(overrides: Record<string, string | undefined>) {
    const base: Record<string, string> = {};
    if (showAll) base.inactive = "1";
    if (branchFilter !== "ALL") base.branch = branchFilter;
    if (tagFilter) base.tag = tagFilter;
    if (alertFilter) base.alert = alertFilter;
    const merged = { ...base, ...overrides };
    // Remove keys explicitly set to undefined
    Object.keys(merged).forEach(k => { if (merged[k] === undefined) delete merged[k]; });
    const qs = new URLSearchParams(merged as Record<string, string>).toString();
    return "/suppliers" + (qs ? "?" + qs : "");
  }

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Proveedores</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {suppliers.length} proveedor{suppliers.length !== 1 ? "es" : ""}
            {!showAll ? " activos" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/suppliers/compare"
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted transition-colors"
          >
            Comparar precios
          </Link>
          {canWrite && (
            <Link
              href="/suppliers/new"
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              + Nuevo proveedor
            </Link>
          )}
        </div>
      </div>


      {/* ── Banner de alerta activa ───────────────────────── */}
      {alertFilter && (
        <div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-4 py-3">
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {alertFilter === "no_cif" && "🪪 Mostrando proveedores sin CIF/NIF registrado"}
            {alertFilter === "no_recent_invoice" && "📋 Mostrando proveedores sin facturas en los últimos 90 días"}
            {alertFilter === "open_quarters" && "📅 Mostrando proveedores con trimestres sin cerrar"}
            <span className="ml-2 font-normal text-amber-700 dark:text-amber-400">
              — {suppliers.length} resultado{suppliers.length !== 1 ? "s" : ""}
            </span>
          </span>
          <Link href="/suppliers" className="text-xs text-amber-700 dark:text-amber-400 hover:underline shrink-0 ml-4">
            Ver todos →
          </Link>
        </div>
      )}

      {/* ── Filtros ─────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Fila 1: activos / todos + rama */}
        <div className="flex flex-wrap gap-2 text-sm">
          {/* Activos / Todos */}
          <div className="flex gap-1 rounded-lg border p-0.5 bg-muted/30">
            <Link
              href={buildUrl({ inactive: undefined })}
              className={`rounded px-3 py-1.5 transition-colors ${!showAll ? "bg-background shadow-sm font-medium" : "hover:bg-muted/60 text-muted-foreground"}`}
            >
              Solo activos
            </Link>
            <Link
              href={buildUrl({ inactive: "1" })}
              className={`rounded px-3 py-1.5 transition-colors ${showAll ? "bg-background shadow-sm font-medium" : "hover:bg-muted/60 text-muted-foreground"}`}
            >
              Todos
            </Link>
          </div>

          {/* Separador */}
          <div className="w-px bg-border self-stretch mx-1" />

          {/* Rama */}
          <div className="flex gap-1 rounded-lg border p-0.5 bg-muted/30">
            {([["ALL", "Todas", ""], ["RESTAURANT", "🍽️ Restaurante", "RESTAURANT"], ["CONSTRUCTION", "🏗️ Construcción", "CONSTRUCTION"]] as const).map(([val, label]) => (
              <Link
                key={val}
                href={buildUrl({ branch: val === "ALL" ? undefined : val })}
                className={`rounded px-3 py-1.5 transition-colors ${branchFilter === val ? "bg-background shadow-sm font-medium" : "hover:bg-muted/60 text-muted-foreground"}`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        {/* Fila 2: tags */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Etiquetas:</span>
            {tagFilter && (
              <Link
                href={buildUrl({ tag: undefined })}
                className="rounded-full px-3 py-1 text-xs border bg-muted/40 hover:bg-muted transition-colors text-muted-foreground"
              >
                ✕ Todas
              </Link>
            )}
            {allTags.map(t => {
              const isActive = tagFilter === t.id;
              return (
                <Link
                  key={t.id}
                  href={buildUrl({ tag: isActive ? undefined : t.id })}
                  className={`rounded-full px-3 py-1 text-xs border transition-colors font-medium ${
                    isActive
                      ? "ring-2 ring-offset-1 opacity-100"
                      : "opacity-70 hover:opacity-100"
                  }`}
                  style={{
                    backgroundColor: t.color + "22",
                    borderColor: t.color + "88",
                    color: t.color,
                    ...(isActive ? { outlineColor: t.color } : {}),
                  }}
                >
                  {t.name}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Lista ───────────────────────────────────────────── */}
      {suppliers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="text-lg">
            {branchFilter !== "ALL" || tagFilter
              ? "Sin proveedores con los filtros seleccionados."
              : "No hay proveedores registrados."}
          </p>
          {canWrite && !branchFilter && !tagFilter && (
            <Link href="/suppliers/new" className="mt-3 inline-block text-sm text-primary hover:underline">
              Añadir el primer proveedor →
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Nombre</th>
                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Contacto</th>
                <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Email / Tel.</th>
                <th className="px-4 py-3 text-left font-medium">Rama / Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {suppliers.map((s) => {
                const branchInfo = BRANCH_LABELS[s.branch ?? "BOTH"];
                return (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors cursor-pointer group">
                    <td className="px-4 py-3">
                      <Link href={`/suppliers/${s.id}`} className="hover:text-primary hover:underline font-medium">
                        {s.name}
                      </Link>
                      {s.taxId && (
                        <span className="ml-2 text-xs text-muted-foreground">{s.taxId}</span>
                      )}
                      {/* Tags */}
                      {s.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {s.tags.map(t => (
                            <span
                              key={t.id}
                              className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium border"
                              style={{
                                backgroundColor: t.color + "22",
                                borderColor: t.color + "88",
                                color: t.color,
                              }}
                            >
                              {t.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      <Link href={`/suppliers/${s.id}`} className="block w-full h-full">
                        {s.contactName ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                      <Link href={`/suppliers/${s.id}`} className="block w-full h-full">
                        {s.email ?? s.phone ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/suppliers/${s.id}`} className="flex flex-col gap-1">
                        {/* Rama */}
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium w-fit ${branchInfo.color}`}>
                          <span>{branchInfo.icon}</span>
                          <span className="hidden sm:inline">{branchInfo.label}</span>
                        </span>
                        {/* Estado */}
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium w-fit ${
                          s.isActive
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {s.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/suppliers/${s.id}`} className="text-primary hover:underline text-sm">
                        Ver →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
