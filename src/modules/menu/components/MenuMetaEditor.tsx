"use client";

/**
 * MenuMetaEditor — edición inline de título y precio del menú.
 * Solo visible para usuarios con permiso de escritura y menús en DRAFT.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMenuMetaAction } from "@/modules/menu/actions/dailyMenus";
import { formatPrice } from "@/modules/menu/lib/menuUtils";

const MENU_TITLES = [
  "MENÚ DEL DÍA",
  "MENÚ FIN DE SEMANA",
  "MENÚ ESPECIAL",
];

interface Props {
  menuId: string;
  menuTitle: string;
  priceInCents: number;
}

export function MenuMetaEditor({ menuId, menuTitle, priceInCents }: Props) {
  const [editing, setEditing]   = useState(false);
  const [title, setTitle]       = useState(menuTitle);
  const [price, setPrice]       = useState(
    (priceInCents / 100).toFixed(2).replace(".", ",")
  );
  const [error, setError]       = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await updateMenuMetaAction(menuId, title, price);
      if (res.error) {
        setError(res.error);
      } else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function handleCancel() {
    setTitle(menuTitle);
    setPrice((priceInCents / 100).toFixed(2).replace(".", ","));
    setError(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {formatPrice(priceInCents)} por menú · {menuTitle}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Editar
        </button>
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2 mt-1">
      <div className="flex flex-wrap items-center gap-2">
        {/* Selector de tipo */}
        <select
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm
                     focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {MENU_TITLES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Precio */}
        <input
          type="text"
          inputMode="decimal"
          value={price}
          onChange={e => setPrice(e.target.value)}
          placeholder="14,50"
          className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm
                     focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="text-sm text-muted-foreground">€</span>

        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground
                     hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Guardando…" : "Guardar"}
        </button>
        <button
          onClick={handleCancel}
          disabled={isPending}
          className="text-xs text-muted-foreground hover:underline"
        >
          Cancelar
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
