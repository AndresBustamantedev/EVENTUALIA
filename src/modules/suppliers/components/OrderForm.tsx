"use client";

import { useActionState, useEffect, useState } from "react";
import type { OrderFormState, ProductRow } from "../types";

const INPUT_CLASS = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";
const LABEL_CLASS = "block text-sm font-medium mb-1";

interface OrderItem {
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string; // euros string
}

interface Props {
  supplierId: string;
  products: ProductRow[];
  action: (prev: OrderFormState, formData: FormData) => Promise<OrderFormState>;
  onSuccess?: () => void;
}

export function OrderForm({ supplierId, products, action, onSuccess }: Props) {
  const [state, formAction, isPending] = useActionState(action, {});
  const [key, setKey] = useState(0);
  const [items, setItems] = useState<OrderItem[]>([
    { productId: "", description: "", quantity: "1", unitPrice: "0" },
  ]);

  useEffect(() => {
    if (state.success) {
      setKey((k) => k + 1);
      setItems([{ productId: "", description: "", quantity: "1", unitPrice: "0" }]);
      onSuccess?.();
    }
  }, [state.success, onSuccess]);

  function updateItem(idx: number, field: keyof OrderItem, val: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: val } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, { productId: "", description: "", quantity: "1", unitPrice: "0" }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(formData: FormData) {
    const itemsPayload = items.map((it) => ({
      productId: it.productId,
      description: it.description || products.find((p) => p.id === it.productId)?.name || "Producto",
      quantity: parseFloat(it.quantity) || 1,
      unitPrice: Math.round(parseFloat(it.unitPrice || "0") * 100),
      notes: "",
    }));
    formData.set("items", JSON.stringify(itemsPayload));
    return formAction(formData);
  }

  return (
    <form key={key} action={handleSubmit} className="space-y-4">
      <input type="hidden" name="supplierId" value={supplierId} />

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-green-600 dark:text-green-400">Pedido creado correctamente.</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="orderDate" className={LABEL_CLASS}>Fecha del pedido <span className="text-destructive">*</span></label>
          <input id="orderDate" name="orderDate" type="date" required disabled={isPending} className={INPUT_CLASS} defaultValue={new Date().toISOString().split("T")[0]} />
        </div>
        <div>
          <label htmlFor="expectedDate" className={LABEL_CLASS}>Fecha de entrega prevista</label>
          <input id="expectedDate" name="expectedDate" type="date" disabled={isPending} className={INPUT_CLASS} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="orderNotes" className={LABEL_CLASS}>Notas</label>
          <textarea id="orderNotes" name="notes" rows={2} disabled={isPending} className={INPUT_CLASS} />
        </div>
      </div>

      {/* Líneas del pedido */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Productos</p>
        {items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-start rounded-md border p-3 bg-muted/20">
            <div className="col-span-12 sm:col-span-4">
              <label className={LABEL_CLASS}>Producto</label>
              <select
                value={item.productId}
                onChange={(e) => {
                  const pid = e.target.value;
                  const prod = products.find((p) => p.id === pid);
                  updateItem(idx, "productId", pid);
                  if (prod) updateItem(idx, "description", prod.name);
                }}
                disabled={isPending}
                className={INPUT_CLASS}
              >
                <option value="">— Seleccionar —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.unit ? ` (${p.unit})` : ""}</option>
                ))}
              </select>
            </div>
            <div className="col-span-12 sm:col-span-3">
              <label className={LABEL_CLASS}>Descripción / presentación</label>
              <input type="text" value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} disabled={isPending} className={INPUT_CLASS} placeholder="Caja 5L, etc." />
            </div>
            <div className="col-span-5 sm:col-span-2">
              <label className={LABEL_CLASS}>Cantidad</label>
              <input type="number" min="0.001" step="any" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} disabled={isPending} className={INPUT_CLASS} />
            </div>
            <div className="col-span-5 sm:col-span-2">
              <label className={LABEL_CLASS}>Precio unit. (€)</label>
              <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} disabled={isPending} className={INPUT_CLASS} />
            </div>
            <div className="col-span-2 sm:col-span-1 flex items-end pb-0.5">
              <button type="button" onClick={() => removeItem(idx)} disabled={items.length === 1 || isPending} className="w-full rounded border px-2 py-2 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-40">✕</button>
            </div>
          </div>
        ))}
        <button type="button" onClick={addItem} disabled={isPending} className="text-sm text-primary hover:underline">
          + Añadir línea
        </button>
      </div>

      <button type="submit" disabled={isPending}
        className="rounded-md bg-primary px-5 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
        {isPending ? "Guardando…" : "Crear pedido"}
      </button>
    </form>
  );
}
