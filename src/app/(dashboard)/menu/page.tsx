/**
 * Página: Lista de menús del día
 * Acceso: ADMIN, RRHH, ENCARGADO, COCINA (menu:read)
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { listDailyMenus } from "@/modules/menu/actions/dailyMenus";
import { formatPrice, DAILY_MENU_STATUS_LABELS } from "@/modules/menu/lib/menuUtils";
import { ClickableRow } from "@/components/ClickableRow";

export const metadata = { title: "Menús — Cruz Blanca" };

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function MenuPage({ searchParams }: PageProps) {
  const params = await searchParams;

  let actor: { role: string };
  try {
    actor = await requirePermission("menu:read");
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/");
    throw e;
  }

  const canWrite =
    actor.role === "ADMIN" || actor.role === "RRHH" || actor.role === "ENCARGADO";

  const statusFilter =
    params.status === "ACTIVE" || params.status === "DRAFT" ? params.status : undefined;

  const menus = await listDailyMenus({ status: statusFilter, limit: 60 });

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Menús</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {menus.length} menú{menus.length !== 1 ? "s" : ""}{statusFilter ? ` · ${DAILY_MENU_STATUS_LABELS[statusFilter] ?? statusFilter}` : ""}
          </p>
        </div>
        {canWrite && (
          <Link
            href="/menu/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            + Nuevo menú
          </Link>
        )}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 text-sm">
        {[
          { label: "Todos", value: "" },
          { label: "Activos", value: "ACTIVE" },
          { label: "Borradores", value: "DRAFT" },
        ].map(f => (
          <Link
            key={f.value}
            href={f.value ? `/menu?status=${f.value}` : "/menu"}
            className={`rounded-full px-3 py-1 border transition-colors ${
              (statusFilter ?? "") === f.value
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-input hover:bg-muted"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Lista */}
      {menus.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No hay menús{statusFilter ? " en este estado" : ""}.{" "}
          {canWrite && (
            <Link href="/menu/new" className="underline">
              Crear el primero
            </Link>
          )}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-input">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-input bg-muted/40">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Menú</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Precio</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Platos</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Estado</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {menus.map(menu => (
                <ClickableRow key={menu.id} href={`/menu/${menu.id}`} className="border-b border-input last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <Link href={`/menu/${menu.id}`} className="font-medium hover:underline">
                      {menu.menuTitle}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatPrice(menu.priceInCents)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {menu.dishes.length} plato{menu.dishes.length !== 1 ? "s" : ""}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        menu.status === "ACTIVE"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      }`}
                    >
                      {DAILY_MENU_STATUS_LABELS[menu.status] ?? menu.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/menu/${menu.id}`}
                      className="text-xs underline text-muted-foreground hover:text-foreground"
                     
                    >
                      Ver / Editar
                    </Link>
                  </td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Catálogo */}
      {canWrite && (
        <div className="pt-2 border-t border-input">
          <Link
            href="/menu/dishes"
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            Gestionar catálogo de platos →
          </Link>
        </div>
      )}
    </div>
  );
}
