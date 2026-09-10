/**
 * Página: Editor de menú del día
 * Acceso: menu:read (todo el mundo); edición solo con menu:write
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { getDailyMenu } from "@/modules/menu/actions/dailyMenus";
import {
  formatMenuDate,
  DAILY_MENU_STATUS_LABELS,
} from "@/modules/menu/lib/menuUtils";
import { MenuEditor } from "@/modules/menu/components/MenuEditor";
import { MenuMetaEditor } from "@/modules/menu/components/MenuMetaEditor";
import { PublishMenuButton } from "@/modules/menu/components/PublishMenuButton";
import { GenerateMenuPdfButton } from "@/modules/menu/components/GenerateMenuPdfButton";
import { DeleteMenuButton } from "@/modules/menu/components/DeleteMenuButton";
import { prisma } from "@/core/db/client";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const menu = await getDailyMenu(id);
  if (!menu) return { title: "Menú no encontrado" };
  return { title: `${menu.menuTitle} ${formatMenuDate(menu.menuDate)} — Cruz Blanca` };
}

export default async function MenuDetailPage({ params }: PageProps) {
  const { id } = await params;

  let actor: { role: string };
  try {
    actor = await requirePermission("menu:read");
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/");
    throw e;
  }

  const menu = await getDailyMenu(id);
  if (!menu) notFound();

  const canWrite =
    actor.role === "ADMIN" || actor.role === "RRHH" || actor.role === "ENCARGADO";
  const canPdf = canWrite;

  // Buscar PDF actual
  const menuPdfModel = (prisma as unknown as Record<string, unknown>)["menuPdf"] as any;
  const currentPdf = await menuPdfModel.findFirst({
    where: { menuId: id, isCurrent: true },
    select: { id: true },
    orderBy: { generatedAt: "desc" },
  });
  const currentPdfId: string | null = currentPdf?.id ?? null;

  const isActive = menu.status === "ACTIVE";

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/menu" className="text-sm text-muted-foreground hover:underline">
              ← Menús
            </Link>
          </div>
          <h1 className="text-2xl font-semibold mt-1">
            {formatMenuDate(menu.menuDate)}
          </h1>

          {/* Estado + edición de precio/título */}
          <div className="mt-1">
            <span
              className={
                isActive
                  ? "text-sm text-green-600 dark:text-green-400 font-medium"
                  : "text-sm text-muted-foreground"
              }
            >
              {DAILY_MENU_STATUS_LABELS[menu.status] ?? menu.status}
            </span>
          </div>

          {canWrite && !isActive ? (
            <div className="mt-1">
              <MenuMetaEditor
                menuId={menu.id}
                menuTitle={menu.menuTitle}
                priceInCents={menu.priceInCents}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-0.5">
              {menu.menuTitle} · {(menu.priceInCents / 100).toFixed(2).replace(".", ",")} €
            </p>
          )}

          {menu.notes && (
            <p className="text-xs text-muted-foreground mt-1 italic">{menu.notes}</p>
          )}
        </div>

        {canWrite && (
          <div className="flex flex-col items-end gap-2">
            <PublishMenuButton menuId={menu.id} isActive={isActive} />
            {canPdf && (
              <GenerateMenuPdfButton menuId={menu.id} currentPdfId={currentPdfId} />
            )}
            {!isActive && (
              <DeleteMenuButton menuId={menu.id} />
            )}
          </div>
        )}
      </div>

      {/* Aviso menú activo */}
      {isActive && canWrite && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300">
          El menú está activo. Para editar los platos o el precio, desactívalo primero.
        </div>
      )}

      {/* Editor de platos */}
      <div className="rounded-md border border-input p-4 space-y-4">
        <h2 className="font-semibold text-base">Platos del menú</h2>
        {menu.dishes.length === 0 && !canWrite ? (
          <p className="text-sm text-muted-foreground italic">Sin platos registrados.</p>
        ) : (
          <MenuEditor
            menuId={menu.id}
            dishes={menu.dishes}
            isActive={isActive}
            canWrite={canWrite}
          />
        )}
      </div>

      {/* Acciones secundarias */}
      {canWrite && (
        <div className="flex gap-4 text-sm pt-2 border-t border-input">
          <Link
            href={`/menu/new?duplicate=${menu.id}`}
            className="text-muted-foreground hover:underline"
          >
            Duplicar para otra fecha →
          </Link>
        </div>
      )}
    </div>
  );
}
