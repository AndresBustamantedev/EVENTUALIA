"use client";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { toggleDishActiveAction } from "@/modules/menu/actions/dishes";
import { DishForm } from "./DishForm";
import type { DishRow } from "@/modules/menu/actions/dishes";
import { DISH_CATEGORY_LABELS } from "@/modules/menu/lib/menuUtils";

interface Props { initialDishes: DishRow[]; canWrite: boolean; }

export function DishesManager({ initialDishes, canWrite }: Props) {
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const router = useRouter();
  const dishes = showInactive ? initialDishes : initialDishes.filter(d => d.isActive);
  const grouped = {
    FIRST:  dishes.filter(d => d.category === "FIRST"),
    SECOND: dishes.filter(d => d.category === "SECOND"),
    OTHER:  dishes.filter(d => d.category === "OTHER"),
  };

  function handleToggle(dishId: string, current: boolean) {
    if (!confirm(current ? "¿Archivar este plato?" : "¿Activar este plato?")) return;
    startTransition(async () => {
      const res = await toggleDishActiveAction(dishId, !current);
      if (res.error) alert(res.error); else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="h-4 w-4 rounded border-input" />
          Mostrar platos archivados
        </label>
        {canWrite && (
          <button type="button" onClick={() => { setShowNew(true); setEditingId(null); }}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            + Nuevo plato
          </button>
        )}
      </div>
      {canWrite && showNew && (
        <div className="rounded-md border border-input p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Nuevo plato</h3>
            <button type="button" onClick={() => setShowNew(false)} className="text-sm text-muted-foreground hover:underline">Cancelar</button>
          </div>
          <DishForm mode="create" onSuccess={() => { setShowNew(false); router.refresh(); }} />
        </div>
      )}
      {(["FIRST", "SECOND", "OTHER"] as const).map(cat => (
        <div key={cat}>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {DISH_CATEGORY_LABELS[cat] ?? cat}<span className="ml-2 font-normal normal-case">({grouped[cat].length})</span>
          </h3>
          {grouped[cat].length === 0
            ? <p className="text-sm text-muted-foreground italic">Sin platos en esta categoría.</p>
            : <ul className="space-y-1">
                {grouped[cat].map(dish => (
                  <li key={dish.id}>
                    {editingId === dish.id ? (
                      <div className="rounded-md border border-input p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-sm">Editando: {dish.name}</h4>
                          <button type="button" onClick={() => setEditingId(null)} className="text-sm text-muted-foreground hover:underline">Cancelar</button>
                        </div>
                        <DishForm mode="edit" dish={dish} onSuccess={() => { setEditingId(null); router.refresh(); }} />
                      </div>
                    ) : (
                      <div className={`flex items-center justify-between rounded-md border border-input px-3 py-2 text-sm ${!dish.isActive ? "opacity-50" : ""}`}>
                        <div>
                          <span className="font-medium">{dish.name}</span>
                          {dish.allergens && <span className="ml-2 text-xs text-muted-foreground">· {dish.allergens}</span>}
                          {!dish.isActive && <span className="ml-2 text-xs text-muted-foreground">[archivado]</span>}
                          <span className="ml-2 text-xs text-muted-foreground">· usado {dish.usageCount} vez{dish.usageCount !== 1 ? "es" : ""}</span>
                        </div>
                        {canWrite && (
                          <div className="flex items-center gap-2 ml-4">
                            <button type="button" onClick={() => setEditingId(dish.id)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">Editar</button>
                            <button type="button" disabled={isPending} onClick={() => handleToggle(dish.id, dish.isActive)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                              {dish.isActive ? "Archivar" : "Activar"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
          }
        </div>
      ))}
      {initialDishes.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No hay platos en el catálogo.</p>}
    </div>
  );
}
