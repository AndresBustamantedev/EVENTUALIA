"use client";

/**
 * MenuEditor — gestión interactiva de los platos de un menú.
 * Permite añadir platos por nombre libre (Enter / botón +) o seleccionarlos
 * del catálogo. Permite eliminarlos con el botón "Quitar".
 * Permite reordenar los platos dentro de cada categoría arrastrando (drag & drop).
 */

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { DishAutocomplete } from "./DishAutocomplete";
import {
  addDishToMenuAction,
  addDishByNameToMenuAction,
  removeDishFromMenuAction,
  reorderDishesAction,
} from "@/modules/menu/actions/dailyMenus";
import type { MenuDishRow } from "@/modules/menu/actions/dailyMenus";
import type { DishRow } from "@/modules/menu/actions/dishes";
import { DISH_CATEGORY_LABELS } from "@/modules/menu/lib/menuUtils";

interface Props {
  menuId: string;
  dishes: MenuDishRow[];
  isActive: boolean;
  canWrite: boolean;
}

function DishList({
  menuId,
  dishes,
  category,
  label,
  isActive,
  canWrite,
}: {
  menuId: string;
  dishes: MenuDishRow[];
  category: string;
  label: string;
  isActive: boolean;
  canWrite: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg]      = useState<string | null>(null);
  const router = useRouter();

  const filtered = dishes.filter(d => d.category === category);

  // Drag-and-drop state
  const dragSrcIdRef  = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function clearError() { setErrorMsg(null); }

  /** Selección desde el dropdown de catálogo */
  function handleSelect(dish: DishRow) {
    clearError();
    startTransition(async () => {
      const res = await addDishToMenuAction(menuId, dish.id, category);
      if (res.error) setErrorMsg(res.error);
      else router.refresh();
    });
  }

  /** Entrada libre: escribir nombre + Enter o botón + */
  function handleAddByName(name: string): Promise<void> {
    clearError();
    return new Promise<void>(resolve => {
      startTransition(async () => {
        const res = await addDishByNameToMenuAction(menuId, name, category);
        if (res.error) setErrorMsg(res.error);
        else router.refresh();
        resolve();
      });
    });
  }

  function handleRemove(menuDishId: string) {
    clearError();
    startTransition(async () => {
      const res = await removeDishFromMenuAction(menuId, menuDishId);
      if (res.error) setErrorMsg(res.error);
      else router.refresh();
    });
  }

  // ── Drag handlers ──────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, id: string) {
    dragSrcIdRef.current = id;
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id !== dragSrcIdRef.current) setDragOverId(id);
  }

  function handleDragLeave() {
    setDragOverId(null);
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    setDragOverId(null);
    const srcId = dragSrcIdRef.current;
    dragSrcIdRef.current = null;
    if (!srcId || srcId === targetId) return;

    // Build new order
    const ids = filtered.map(d => d.id);
    const srcIdx = ids.indexOf(srcId);
    const tgtIdx = ids.indexOf(targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;

    const reordered = [...ids];
    reordered.splice(srcIdx, 1);
    reordered.splice(tgtIdx, 0, srcId);

    startTransition(async () => {
      const res = await reorderDishesAction(menuId, reordered);
      if (res.error) setErrorMsg(res.error);
      else router.refresh();
    });
  }

  function handleDragEnd() {
    dragSrcIdRef.current = null;
    setDragOverId(null);
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        {label}
      </h3>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground italic mb-3">Sin platos en esta categoría.</p>
      ) : (
        <ul className="space-y-1 mb-3">
          {filtered.map(d => {
            const isDraggingOver = dragOverId === d.id;
            return (
              <li
                key={d.id}
                draggable={canWrite && !isActive}
                onDragStart={e => handleDragStart(e, d.id)}
                onDragOver={e => handleDragOver(e, d.id)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, d.id)}
                onDragEnd={handleDragEnd}
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm
                  transition-colors select-none
                  ${isDraggingOver
                    ? "border-primary bg-primary/5"
                    : "border-input"
                  }
                  ${canWrite && !isActive ? "cursor-grab active:cursor-grabbing" : ""}
                `}
              >
                <span className="flex items-center gap-2">
                  {canWrite && !isActive && (
                    <span
                      className="text-muted-foreground/50 hover:text-muted-foreground text-xs select-none"
                      title="Arrastra para reordenar"
                    >
                      ⠿
                    </span>
                  )}
                  <span className={!canWrite || isActive ? "text-muted-foreground" : ""}>❖</span>
                  {d.dishName}
                </span>
                {canWrite && !isActive && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleRemove(d.id)}
                    className="text-xs text-destructive hover:underline ml-4 disabled:opacity-50 shrink-0"
                    title="Quitar del menú"
                  >
                    Quitar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canWrite && !isActive && (
        <div className="space-y-1">
          <DishAutocomplete
            category={category}
            onSelect={handleSelect}
            onAddByName={handleAddByName}
            placeholder={`Escribe un ${label.toLowerCase().replace(/s$/, "")} y pulsa Enter…`}
            disabled={isPending}
          />
          {errorMsg && (
            <p className="text-xs text-destructive">{errorMsg}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function MenuEditor({ menuId, dishes, isActive, canWrite }: Props) {
  const categories: Array<{ key: string; label: string }> = [
    { key: "FIRST",  label: DISH_CATEGORY_LABELS["FIRST"]  ?? "Primeros" },
    { key: "SECOND", label: DISH_CATEGORY_LABELS["SECOND"] ?? "Segundos" },
    { key: "OTHER",  label: DISH_CATEGORY_LABELS["OTHER"]  ?? "Otros" },
  ];

  return (
    <div className="space-y-6">
      {categories.map(({ key, label }) => (
        <DishList
          key={key}
          menuId={menuId}
          dishes={dishes}
          category={key}
          label={label}
          isActive={isActive}
          canWrite={canWrite}
        />
      ))}
    </div>
  );
}
