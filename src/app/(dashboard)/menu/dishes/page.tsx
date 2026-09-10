/**
 * Página: Catálogo de platos
 * Acceso: ADMIN, RRHH, ENCARGADO, COCINA (menu:read; edición menu:write)
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { listDishes } from "@/modules/menu/actions/dishes";
import { DishesManager } from "@/modules/menu/components/DishesManager";

export const metadata = { title: "Catalogo de platos — Cruz Blanca" };

export default async function DishesPage() {
  let actor: { role: string };
  try {
    actor = await requirePermission("menu:read");
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/");
    throw e;
  }

  const canWrite =
    actor.role === "ADMIN" || actor.role === "RRHH" || actor.role === "ENCARGADO";

  // Cargar todos (incluyendo inactivos) para el manager del cliente
  const dishes = await listDishes(true);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <div className="mb-1">
            <Link href="/menu" className="text-sm text-muted-foreground hover:underline">
              {"<- Menus"}
            </Link>
          </div>
          <h1 className="text-2xl font-semibold">{"Catalogo de platos"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {dishes.filter(d => d.isActive).length}{" platos activos · "}{dishes.length}{" en total"}
          </p>
        </div>
      </div>

      <DishesManager initialDishes={dishes} canWrite={canWrite} />
    </div>
  );
}
