"use client";
import { useActionState } from "react";
import type { DishRow, DishState } from "@/modules/menu/actions/dishes";
import { createDishAction, updateDishAction } from "@/modules/menu/actions/dishes";
import { DISH_CATEGORY_LABELS, DISH_CATEGORIES } from "@/modules/menu/lib/menuUtils";

interface CreateProps { mode: "create"; onSuccess?: () => void; }
interface EditProps { mode: "edit"; dish: DishRow; onSuccess?: () => void; }
type Props = CreateProps | EditProps;
const initialState: DishState = {};

export function DishForm(props: Props) {
  const dish = props.mode === "edit" ? props.dish : null;
  type ActionFn = (_prev: DishState, formData: FormData) => Promise<DishState>;
  const action: ActionFn = props.mode === "edit"
    ? (updateDishAction.bind(null, props.dish.id) as unknown as ActionFn)
    : createDishAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  if (state.success && props.onSuccess) props.onSuccess();

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor={`name-${props.mode}`}>
          Nombre del plato <span className="text-destructive">*</span>
        </label>
        <input id={`name-${props.mode}`} name="name" type="text" defaultValue={dish?.name ?? ""}
          maxLength={200} required placeholder="Ej. Lentejas con chorizo"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor={`category-${props.mode}`}>
          Categoría <span className="text-destructive">*</span>
        </label>
        <select id={`category-${props.mode}`} name="category" defaultValue={dish?.category ?? "FIRST"}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          {DISH_CATEGORIES.map(cat => <option key={cat} value={cat}>{DISH_CATEGORY_LABELS[cat] ?? cat}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor={`allergens-${props.mode}`}>Alérgenos</label>
        <input id={`allergens-${props.mode}`} name="allergens" type="text" defaultValue={dish?.allergens ?? ""}
          placeholder="Ej. Gluten, Lácteos"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>
      {props.mode === "edit" && (
        <div className="flex items-center gap-2">
          <input id="isActive" name="isActive" type="checkbox" defaultChecked={dish?.isActive}
            value="true" onChange={e => {
              const inp = e.target.form?.querySelector<HTMLInputElement>("[name=\"isActive\"][type=\"hidden\"]");
              if (inp) inp.value = e.target.checked ? "true" : "false";
            }} className="h-4 w-4 rounded border-input" />
          <input type="hidden" name="isActive" defaultValue={dish?.isActive ? "true" : "false"} />
          <label htmlFor="isActive" className="text-sm">Plato activo (disponible para añadir a menús)</label>
        </div>
      )}
      {state.error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300">{state.success}</p>}
      <div className="pt-1">
        <button type="submit" disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
          {isPending ? (props.mode === "create" ? "Guardando…" : "Actualizando…") : (props.mode === "create" ? "Crear plato" : "Guardar cambios")}
        </button>
      </div>
    </form>
  );
}
