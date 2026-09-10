/**
 * Página: Crear nuevo menú del día
 *
 * - MENÚ DEL DÍA → fecha auto (hoy), no se muestra selector
 * - MENÚ FIN DE SEMANA → selector de fecha manual
 */
"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createDailyMenuAction } from "@/modules/menu/actions/dailyMenus";
import type { MenuState } from "@/modules/menu/actions/dailyMenus";

const initialState: MenuState = {};

const MENU_TITLES = [
  "MENÚ DEL DÍA",
  "MENÚ FIN DE SEMANA",
  "MENÚ ESPECIAL",
];

const MENU_DEL_DIA = "MENÚ DEL DÍA";

export default function NewMenuPage() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createDailyMenuAction, initialState);
  const [selectedTitle, setSelectedTitle] = useState(MENU_DEL_DIA);

  useEffect(() => {
    if (state.menuId) {
      router.push(`/menu/${state.menuId}`);
    }
  }, [state.menuId, router]);

  // Fecha por defecto para menús que sí muestran selector: mañana
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().split("T")[0];

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nuevo menú</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crea el menú en estado borrador. Podrás añadir platos antes de publicarlo.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        {/* Tipo de menú */}
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="menuTitle">
            Tipo de menú <span className="text-destructive">*</span>
          </label>
          <select
            id="menuTitle"
            name="menuTitle"
            value={selectedTitle}
            onChange={e => setSelectedTitle(e.target.value)}
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {MENU_TITLES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Fecha — opcional para todos los tipos; si vacía se usa hoy */}
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="menuDate">
            Fecha del menú
            <span className="text-muted-foreground font-normal ml-1">(opcional — por defecto hoy)</span>
          </label>
          <input
            id="menuDate"
            name="menuDate"
            type="date"
            defaultValue={selectedTitle !== MENU_DEL_DIA ? defaultDate : ""}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Precio */}
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="price">
            Precio del menú (€) <span className="text-destructive">*</span>
          </label>
          <input
            id="price"
            name="price"
            type="text"
            inputMode="decimal"
            placeholder="14,50"
            defaultValue="14,50"
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-1">Usa coma o punto como separador decimal.</p>
        </div>

        {/* Notas */}
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="notes">
            Notas internas
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            placeholder="Observaciones opcionales (no aparecen en el PDF)"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        {state.error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground
                       hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isPending ? "Creando…" : "Crear menú"}
          </button>
          <Link href="/menu" className="text-sm text-muted-foreground hover:underline">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
