/**
 * Comparador de precios entre proveedores
 * Muestra todos los productos con ofertas de varios proveedores,
 * ordenadas por precio por unidad base (€/ud)
 */
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { redirect } from "next/navigation";
import { getPriceComparison } from "@/modules/suppliers/actions/products";
import { createProductAction } from "@/modules/suppliers/actions/products";
import { ProductForm } from "@/modules/suppliers/components/ProductForm";
import Link from "next/link";

export const metadata = { title: "Comparar precios — Proveedores" };

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

export default async function ComparePage() {
  let actor: { role: string };
  try {
    actor = await requirePermission("suppliers:read");
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/suppliers");
    throw e;
  }

  const canWrite = actor.role === "ADMIN" || actor.role === "RRHH";
  const comparison = await getPriceComparison();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/suppliers" className="hover:underline">Proveedores</Link>
            <span>/</span>
            <span>Comparar precios</span>
          </div>
          <h1 className="text-2xl font-semibold">Comparador de precios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Precio normalizado a la unidad base para comparar presentaciones distintas entre proveedores.
          </p>
        </div>
      </div>

      {comparison.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground space-y-2">
          <p className="text-lg">Sin datos de precios todavía.</p>
          <p className="text-sm">Entra en un proveedor → pestaña Precios y añade productos con sus precios.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {comparison.map((product) => {
            // Sort offers by pricePerUnit ascending
            const sorted = [...product.offers].sort((a, b) => a.pricePerUnit - b.pricePerUnit);
            const best = sorted[0];
            return (
              <div key={product.productId} className="rounded-lg border overflow-hidden">
                <div className="px-4 py-3 bg-muted/50 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-sm">{product.productName}</h2>
                    {product.productUnit && (
                      <p className="text-xs text-muted-foreground">Unidad base: {product.productUnit}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{sorted.length} proveedor{sorted.length !== 1 ? "es" : ""}</span>
                </div>
                <div className="divide-y">
                  {sorted.map((offer, idx) => {
                    const isBest = idx === 0;
                    const diff = isBest ? 0 : Math.round(((offer.pricePerUnit - best.pricePerUnit) / best.pricePerUnit) * 100);
                    return (
                      <div key={offer.supplierProductId} className={`px-4 py-3 flex items-center gap-4 ${isBest ? "bg-green-50 dark:bg-green-900/10" : ""}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Link href={`/suppliers/${offer.supplierId}`} className="text-sm font-medium hover:underline">
                              {offer.supplierName}
                            </Link>
                            {isBest && (
                              <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 text-xs font-medium">
                                Mejor precio
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {offer.presentation} · {offer.quantity} ud
                            {offer.reference ? ` · ref. ${offer.reference}` : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold">{euros(offer.priceInCents)}</p>
                          <p className="text-xs text-muted-foreground">
                            {euros(offer.pricePerUnit)}/ud
                            {!isBest && <span className="ml-1 text-amber-600">+{diff}%</span>}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Añadir producto al catálogo */}
      {canWrite && (
        <div className="border-t pt-6 max-w-lg">
          <h2 className="text-base font-semibold mb-1">Añadir producto al catálogo</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Crea el producto genérico y luego asigna precios desde la ficha de cada proveedor.
          </p>
          <ProductForm action={createProductAction} />
        </div>
      )}
    </div>
  );
}
