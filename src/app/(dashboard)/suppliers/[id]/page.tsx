/**
 * Página de detalle de proveedor
 * Pestañas: Ficha | Facturas | Pedidos | Precios
 */
import Link from "next/link";
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { redirect } from "next/navigation";
import { getSupplier, getSupplierCounts, updateSupplierAction, listTags } from "@/modules/suppliers/actions/suppliers";
import { listInvoices, createInvoiceAction, markInvoicePaidAction } from "@/modules/suppliers/actions/invoices";
import { listBundles } from "@/modules/suppliers/actions/bundles";
import { SupplierQuarterView } from "@/modules/suppliers/components/SupplierQuarterView";
import { listOrders, createOrderAction, updateOrderStatusAction } from "@/modules/suppliers/actions/orders";
import { listSupplierProducts, listProducts, createSupplierProductAction } from "@/modules/suppliers/actions/products";
import { listQuarterStatuses } from "@/modules/suppliers/actions/quarterStatus";
import { SupplierForm } from "@/modules/suppliers/components/SupplierForm";
import { InvoiceForm } from "@/modules/suppliers/components/InvoiceForm";
import { OrderForm } from "@/modules/suppliers/components/OrderForm";
import { SupplierProductForm } from "@/modules/suppliers/components/SupplierProductForm";
import { MarkPaidButton } from "@/modules/suppliers/components/MarkPaidButton";
import { OrderStatusButton } from "@/modules/suppliers/components/OrderStatusButton";
import { SupplierDeleteButton } from "@/modules/suppliers/components/SupplierDeleteButton";
import { SupplierToggleActiveButton } from "@/modules/suppliers/components/SupplierToggleActiveButton";
import type { OrderStatus } from "@/modules/suppliers/types";
import { TarifasTab } from "@/modules/suppliers/components/TarifasTab";

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

const BRANCH_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  RESTAURANT:   { label: "Restaurante",  icon: "🍽️", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  CONSTRUCTION: { label: "Construcción", icon: "🏗️", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  BOTH:         { label: "Ambas ramas",  icon: "🔄", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
};

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pendiente",
  SENT: "Enviado",
  RECEIVED: "Recibido",
  CANCELLED: "Cancelado",
};

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  try {
    const s = await getSupplier(id);
    return { title: `${s.name} — Proveedores` };
  } catch {
    return { title: "Proveedor — Cruz Blanca" };
  }
}

export default async function SupplierDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;

  let actor: { role: string };
  try {
    actor = await requirePermission("suppliers:read");
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/suppliers");
    throw e;
  }

  const canWrite = actor.role === "ADMIN" || actor.role === "RRHH";

  let supplier;
  try {
    supplier = await getSupplier(id);
  } catch {
    redirect("/suppliers");
  }

  const tab = sp.tab ?? "ficha";

  const [invoices, bundles, orders, supplierPrices, allProducts, quarterStatuses, allTags, supplierCounts] = await Promise.all([
    tab === "facturas" ? listInvoices(id) : Promise.resolve([]),
    tab === "facturas" ? listBundles(id) : Promise.resolve([]),
    tab === "pedidos" ? listOrders(id) : Promise.resolve([]),
    (tab === "precios" || tab === "tarifas") ? listSupplierProducts(id) : Promise.resolve([]),
    (tab === "pedidos" || tab === "precios") ? listProducts(true) : Promise.resolve([]),
    tab === "facturas" ? listQuarterStatuses(id) : Promise.resolve([]),
    listTags(),
    canWrite ? getSupplierCounts(id) : Promise.resolve({ invoiceCount: 0, bundleCount: 0, orderCount: 0 }),
  ]);

  const tabs = [
    { key: "ficha", label: "Ficha" },
    { key: "facturas", label: "Facturas" },
    { key: "pedidos", label: "Pedidos" },
    { key: "precios", label: "Precios" },
    { key: "tarifas", label: "Tarifas" },
  ];

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/suppliers" className="text-sm text-muted-foreground hover:underline">Proveedores</Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm font-medium">{supplier.name}</span>
          </div>
          <h1 className="text-2xl font-semibold mt-1">{supplier.name}</h1>
          {supplier.taxId && <p className="text-sm text-muted-foreground">{supplier.taxId}</p>}
          {/* Branch + tags */}
          {(() => {
            const branchInfo = BRANCH_LABELS[supplier.branch ?? "BOTH"];
            return (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${branchInfo.color}`}>
                  <span>{branchInfo.icon}</span>
                  <span>{branchInfo.label}</span>
                </span>
                {supplier.tags?.map((t: { id: string; name: string; color: string }) => (
                  <span
                    key={t.id}
                    className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium border"
                    style={{ backgroundColor: t.color + "22", borderColor: t.color + "88", color: t.color }}
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${supplier.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
          {supplier.isActive ? "Activo" : "Inactivo"}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/suppliers/${id}?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* ── Ficha ─────────────────────────────────────────── */}
      {tab === "ficha" && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 max-w-2xl">
            {[
              ["Nombre", supplier.name],
              ["CIF / NIF", supplier.taxId],
              ["Contacto", supplier.contactName],
              ["Email", supplier.email],
              ["Teléfono", supplier.phone],
              ["Dirección", supplier.address],
              ["Sitio web", supplier.website],
            ].map(([label, value]) => (
              value ? (
                <div key={label as string}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
                  {label === "Sitio web" ? (
                    <a href={value as string} target="_blank" rel="noopener noreferrer" className="text-sm font-medium mt-0.5 text-primary hover:underline break-all">
                      {value}
                    </a>
                  ) : (
                    <p className="text-sm font-medium mt-0.5">{value}</p>
                  )}
                </div>
              ) : null
            ))}
            {supplier.notes && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Notas</p>
                <p className="text-sm mt-0.5 whitespace-pre-line">{supplier.notes}</p>
              </div>
            )}
          </div>

          {canWrite && (
            <div className="border-t pt-6">
              <h2 className="text-base font-semibold mb-4">Editar datos</h2>
              <SupplierForm mode="edit" supplier={supplier} action={updateSupplierAction} allTags={allTags} />
            </div>
          )}

          {canWrite && (
            <SupplierDeleteButton
              supplierId={id}
              supplierName={supplier.name}
              invoiceCount={supplierCounts.invoiceCount}
              bundleCount={supplierCounts.bundleCount}
              orderCount={supplierCounts.orderCount}
            />
          )}

          {canWrite && supplier.name !== "Sin asignar" && (
            <SupplierToggleActiveButton
              supplierId={id}
              supplierName={supplier.name}
              initialIsActive={supplier.isActive}
            />
          )}
        </div>
      )}

      {/* ── Facturas ──────────────────────────────────────── */}
      {tab === "facturas" && (
        <div className="space-y-6">
          <SupplierQuarterView
            supplierId={id}
            invoices={invoices}
            bundles={bundles}
            canWrite={canWrite}
            quarterStatuses={quarterStatuses}
            InvoiceFormSlot={
              canWrite ? (
                <div className="border-t pt-6">
                  <h2 className="text-base font-semibold mb-4">Registrar factura individual</h2>
                  <InvoiceForm supplierId={id} action={createInvoiceAction} bundles={bundles} />
                </div>
              ) : undefined
            }
          />
        </div>
      )}

      {/* ── Pedidos ───────────────────────────────────────── */}
      {tab === "pedidos" && (
        <div className="space-y-6">
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin pedidos registrados.</p>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <div key={order.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Pedido {order.orderDate}</p>
                      {order.expectedDate && <p className="text-xs text-muted-foreground">Entrega prevista: {order.expectedDate}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        order.status === "RECEIVED" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        order.status === "CANCELLED" ? "bg-red-100 text-red-700" :
                        order.status === "SENT" ? "bg-blue-100 text-blue-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </span>
                      {canWrite && order.status !== "RECEIVED" && order.status !== "CANCELLED" && (
                        <OrderStatusButton orderId={order.id} currentStatus={order.status} action={updateOrderStatusAction} />
                      )}
                    </div>
                  </div>
                  <table className="w-full text-xs">
                    <thead><tr className="text-muted-foreground"><th className="text-left pb-1">Producto</th><th className="text-right pb-1">Cant.</th><th className="text-right pb-1">P.unit.</th><th className="text-right pb-1">Total</th></tr></thead>
                    <tbody className="divide-y">
                      {order.items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-1">{item.description}</td>
                          <td className="py-1 text-right">{item.quantity}</td>
                          <td className="py-1 text-right">{euros(item.unitPrice)}</td>
                          <td className="py-1 text-right font-medium">{euros(item.quantity * item.unitPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-medium">
                        <td colSpan={3} className="pt-2 text-right">Total pedido:</td>
                        <td className="pt-2 text-right">{euros(order.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {order.notes && <p className="text-xs text-muted-foreground">{order.notes}</p>}
                </div>
              ))}
            </div>
          )}

          {canWrite && (
            <div className="border-t pt-6">
              <h2 className="text-base font-semibold mb-4">Nuevo pedido</h2>
              {allProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay productos en el catálogo. <Link href="/suppliers/compare" className="text-primary hover:underline">Añadir productos →</Link></p>
              ) : (
                <OrderForm supplierId={id} products={allProducts} action={createOrderAction} />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Precios ───────────────────────────────────────── */}
      {tab === "precios" && (
        <div className="space-y-6">
          {supplierPrices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay precios registrados para este proveedor.</p>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Producto</th>
                    <th className="px-4 py-3 text-left font-medium">Presentación</th>
                    <th className="px-4 py-3 text-right font-medium">Precio</th>
                    <th className="px-4 py-3 text-right font-medium">€ / ud base</th>
                    <th className="px-4 py-3 text-left font-medium">Ref.</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {supplierPrices.map((sp) => (
                    <tr key={sp.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <p className="font-medium">{sp.productName}</p>
                        {sp.productUnit && <p className="text-xs text-muted-foreground">ud: {sp.productUnit}</p>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{sp.presentation} ({sp.quantity} ud)</td>
                      <td className="px-4 py-3 text-right font-medium">{euros(sp.priceInCents)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{euros(sp.pricePerUnit)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{sp.reference ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canWrite && (
            <div className="border-t pt-6">
              <h2 className="text-base font-semibold mb-4">Añadir precio</h2>
              {allProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Primero <Link href="/suppliers/compare" className="text-primary hover:underline">añade productos al catálogo</Link>.</p>
              ) : (
                <SupplierProductForm supplierId={id} products={allProducts} action={createSupplierProductAction} />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tarifas ───────────────────────────────────────── */}
      {tab === "tarifas" && (
        <TarifasTab
          supplierId={id}
          supplierName={supplier.name}
          currentPrices={supplierPrices}
          canWrite={canWrite}
        />
      )}
    </div>
  );
}
