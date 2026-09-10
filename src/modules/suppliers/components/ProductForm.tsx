"use client";

import { useActionState, useEffect, useState } from "react";
import type { ProductFormState } from "../types";

const INPUT_CLASS = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";
const LABEL_CLASS = "block text-sm font-medium mb-1";
const ERROR_CLASS = "mt-1 text-xs text-destructive";

interface Props {
  action: (prev: ProductFormState, formData: FormData) => Promise<ProductFormState>;
}

export function ProductForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, {});
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (state.success) setKey((k) => k + 1);
  }, [state.success]);

  const fe = state.fieldErrors ?? {};
  const fieldError = (f: string) =>
    fe[f]?.[0] ? <p className={ERROR_CLASS}>{fe[f][0]}</p> : null;

  return (
    <form key={key} action={formAction} className="space-y-4">
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-green-600 dark:text-green-400">Producto creado. Ya puedes asignarle precios desde la ficha del proveedor.</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label htmlFor="pName" className={LABEL_CLASS}>Nombre del producto <span className="text-destructive">*</span></label>
          <input id="pName" name="name" type="text" required disabled={isPending} className={INPUT_CLASS} placeholder="Aceite de oliva virgen extra" />
          {fieldError("name")}
        </div>
        <div>
          <label htmlFor="pCategory" className={LABEL_CLASS}>Categoría</label>
          <input id="pCategory" name="category" type="text" disabled={isPending} className={INPUT_CLASS} placeholder="aceites, carnes, lácteos…" />
        </div>
        <div>
          <label htmlFor="pUnit" className={LABEL_CLASS}>Unidad base</label>
          <input id="pUnit" name="unit" type="text" disabled={isPending} className={INPUT_CLASS} placeholder="L, kg, ud, m…" />
          <p className="mt-1 text-xs text-muted-foreground">Para normalizar precios entre presentaciones</p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="pNotes" className={LABEL_CLASS}>Notas</label>
          <textarea id="pNotes" name="notes" rows={2} disabled={isPending} className={INPUT_CLASS} />
        </div>
      </div>

      <button type="submit" disabled={isPending}
        className="rounded-md bg-primary px-5 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
        {isPending ? "Guardando…" : "Añadir producto"}
      </button>
    </form>
  );
}
