"use client";

import { useActionState, useEffect, useState } from "react";
import type { SupplierProductFormState, ProductRow } from "../types";

const INPUT_CLASS = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";
const LABEL_CLASS = "block text-sm font-medium mb-1";
const ERROR_CLASS = "mt-1 text-xs text-destructive";

interface Props {
  supplierId: string;
  products: ProductRow[];
  action: (prev: SupplierProductFormState, formData: FormData) => Promise<SupplierProductFormState>;
  onSuccess?: () => void;
}

export function SupplierProductForm({ supplierId, products, action, onSuccess }: Props) {
  const [state, formAction, isPending] = useActionState(action, {});
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (state.success) {
      setKey((k) => k + 1);
      onSuccess?.();
    }
  }, [state.success, onSuccess]);

  const fe = state.fieldErrors ?? {};
  const fieldError = (f: string) =>
    fe[f]?.[0] ? <p className={ERROR_CLASS}>{fe[f][0]}</p> : null;

  return (
    <form key={key} action={formAction} className="space-y-4">
      <input type="hidden" name="supplierId" value={supplierId} />

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-green-600 dark:text-green-400">Precio registrado.</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label htmlFor="spProductId" className={LABEL_CLASS}>Producto <span className="text-destructive">*</span></label>
          <select id="spProductId" name="productId" required disabled={isPending} className={INPUT_CLASS}>
            <option value="">— Seleccionar —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.unit ? ` (${p.unit})` : ""}{p.category ? ` — ${p.category}` : ""}</option>
            ))}
          </select>
          {fieldError("productId")}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="spPresentation" className={LABEL_CLASS}>Presentación <span className="text-destructive">*</span></label>
          <input id="spPresentation" name="presentation" type="text" required disabled={isPending} className={INPUT_CLASS} placeholder="Caja 12 unidades, garrafa 5L, saco 25kg…" />
          {fieldError("presentation")}
        </div>

        <div>
          <label htmlFor="spQuantity" className={LABEL_CLASS}>Cantidad (unidades base) <span className="text-destructive">*</span></label>
          <input id="spQuantity" name="quantity" type="number" min="0.0001" step="any" required disabled={isPending} className={INPUT_CLASS} placeholder="5" />
          <p className="mt-1 text-xs text-muted-foreground">Unidades base que contiene la presentación (ej. 5 si son 5 L)</p>
          {fieldError("quantity")}
        </div>

        <div>
          <label htmlFor="spPriceDisplay" className={LABEL_CLASS}>Precio presentación (€) <span className="text-destructive">*</span></label>
          <input id="spPriceDisplay" type="number" min="0" step="0.01" required disabled={isPending} className={INPUT_CLASS} placeholder="12.50"
            onChange={(e) => {
              const h = document.getElementById("spPriceCents") as HTMLInputElement | null;
              if (h) h.value = String(Math.round(parseFloat(e.target.value || "0") * 100));
            }} />
          <input type="hidden" id="spPriceCents" name="priceInCents" defaultValue="0" />
          {fieldError("priceInCents")}
        </div>

        <div>
          <label htmlFor="spRef" className={LABEL_CLASS}>Referencia del proveedor</label>
          <input id="spRef" name="reference" type="text" disabled={isPending} className={INPUT_CLASS} placeholder="Código SKU…" />
        </div>
      </div>

      <button type="submit" disabled={isPending}
        className="rounded-md bg-primary px-5 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
        {isPending ? "Guardando…" : "Añadir precio"}
      </button>
    </form>
  );
}
