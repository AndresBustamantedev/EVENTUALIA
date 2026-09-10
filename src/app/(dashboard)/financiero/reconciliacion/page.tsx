import { Suspense } from "react";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import { listSuppliers } from "@/modules/suppliers/actions/suppliers";
import { getReconciliation } from "@/modules/gestoria/actions/reconciliation";
import { QUARTER_LABELS } from "@/modules/gestoria/types";
import MayorUploadForm from "./MayorUploadForm";

// ── Helpers de formato ──────────────────────────────────────────

function formatEuros(cents: number | null): string {
  if (cents === null) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function StatusBadge({ status }: { status: "matched" | "only_mayor" | "only_app" }) {
  if (status === "matched")    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs font-medium">✓ Coincide</span>;
  if (status === "only_mayor") return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-medium">⚠ Solo en mayor</span>;
  return                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">✗ Solo en app</span>;
}

// ── Página ───────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{
    supplierId?: string;
    year?: string;
    quarter?: string;
  }>;
}

export default async function ReconciliacionPage({ searchParams }: PageProps) {
  await requirePermission("suppliers:read");

  const params = await searchParams;
  const suppliers = await listSuppliers();

  const supplierId = params.supplierId ?? "";
  const year       = params.year ? parseInt(params.year, 10) : new Date().getFullYear();
  const quarter    = params.quarter ? parseInt(params.quarter, 10) : Math.ceil((new Date().getMonth() + 1) / 3);

  const hasFilter = !!supplierId && !isNaN(year) && !isNaN(quarter) && quarter >= 1 && quarter <= 4;
  const reconciliation = hasFilter
    ? await getReconciliation(supplierId, year, quarter)
    : null;

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);

  const currentYear = new Date().getFullYear();
  const YEARS = [currentYear - 1, currentYear, currentYear + 1];
  const QUARTERS = [
    { value: 1, label: "T1 Ene–Mar" },
    { value: 2, label: "T2 Abr–Jun" },
    { value: 3, label: "T3 Jul–Sep" },
    { value: 4, label: "T4 Oct–Dic" },
  ];

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href="/financiero" className="hover:underline">Financiero</Link>
          <span>/</span>
          <span>Reconciliación</span>
        </div>
        <h1 className="text-2xl font-semibold">Reconciliación con mayor de proveedor</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sube el mayor que emite el proveedor y compara automáticamente con las facturas registradas en la app.
        </p>
      </div>

      {/* Filtros de búsqueda */}
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground mb-3">Selecciona proveedor y período a comparar</p>
        <form method="GET" className="flex flex-wrap items-end gap-3">
          {/* Proveedor */}
          <div className="min-w-48">
            <label className="block text-xs text-muted-foreground mb-1">Proveedor</label>
            <select
              name="supplierId"
              defaultValue={supplierId}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— Todos —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Año */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Año</label>
            <select
              name="year"
              defaultValue={String(year)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {YEARS.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>

          {/* Trimestre */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Trimestre</label>
            <select
              name="quarter"
              defaultValue={String(quarter)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {QUARTERS.map((q) => (
                <option key={q.value} value={String(q.value)}>{q.label}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Ver reconciliación
          </button>

          {hasFilter && (
            <Link
              href="/financiero/reconciliacion"
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              Limpiar
            </Link>
          )}
        </form>
      </div>

      {/* Panel principal: solo se muestra si hay filtro activo */}
      {hasFilter ? (
        <div className="space-y-6">
          {/* Título del período */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">
              {selectedSupplier?.name ?? "Proveedor"} — {QUARTER_LABELS[quarter]} {year}
            </h2>
          </div>

          {/* Subir / reemplazar mayor */}
          <details className="rounded-lg border border-border bg-card" open={!reconciliation?.mayor}>
            <summary className="cursor-pointer px-5 py-3 text-sm font-medium select-none flex items-center gap-2">
              <span>{reconciliation?.mayor ? "Reemplazar mayor subido" : "Subir mayor del proveedor"}</span>
              {reconciliation?.mayor && (
                <span className="text-xs text-muted-foreground font-normal ml-1">
                  (subido {new Date(reconciliation.mayor.createdAt).toLocaleDateString("es-ES")} · {reconciliation.mayor.lineCount} líneas extraídas)
                </span>
              )}
            </summary>
            <div className="px-5 pb-5 pt-2 border-t border-border">
              <Suspense fallback={null}>
                <MayorUploadForm
                  suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
                  defaultSupplierId={supplierId}
                  defaultYear={year}
                  defaultQuarter={quarter}
                />
              </Suspense>
            </div>
          </details>

          {reconciliation && reconciliation.mayor ? (
            <>
              {/* Resumen */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-card px-5 py-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Coinciden</p>
                  <p className="mt-1 text-2xl font-semibold text-emerald-600">{reconciliation.summary.matched}</p>
                </div>
                <div className="rounded-lg border border-border bg-card px-5 py-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Solo en mayor</p>
                  <p className="mt-1 text-2xl font-semibold text-amber-600">{reconciliation.summary.onlyMayor}</p>
                </div>
                <div className="rounded-lg border border-border bg-card px-5 py-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Solo en app</p>
                  <p className="mt-1 text-2xl font-semibold text-red-600">{reconciliation.summary.onlyApp}</p>
                </div>
                <div className="rounded-lg border border-border bg-card px-5 py-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Diferencia total</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {formatEuros(reconciliation.summary.totalDiff)}
                  </p>
                </div>
              </div>

              {/* Tabla de líneas */}
              {reconciliation.lines.length === 0 ? (
                <div className="rounded-lg border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
                  No hay facturas registradas ni líneas en el mayor para este período.
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Estado</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Nº Factura</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Fecha mayor</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Fecha app</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Importe mayor</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Importe app</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Diferencia</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {reconciliation.lines.map((line, i) => (
                          <tr
                            key={i}
                            className={
                              line.status === "matched" && line.amountDiff !== 0
                                ? "bg-amber-50/50"
                                : line.status === "only_mayor"
                                ? "bg-amber-50/30"
                                : line.status === "only_app"
                                ? "bg-red-50/30"
                                : ""
                            }
                          >
                            <td className="px-4 py-3 whitespace-nowrap">
                              <StatusBadge status={line.status} />
                            </td>
                            <td className="px-4 py-3 font-mono text-xs">
                              {line.invoiceNumber ?? <span className="text-muted-foreground italic">Sin número</span>}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">
                              {line.mayorDate ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">
                              {line.appDate ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {formatEuros(line.mayorAmount)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {formatEuros(line.appAmount)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {line.amountDiff !== null && line.amountDiff !== 0 ? (
                                <span className={line.amountDiff > 0 ? "text-amber-600" : "text-red-600"}>
                                  {line.amountDiff > 0 ? "+" : ""}{formatEuros(line.amountDiff)}
                                </span>
                              ) : line.status === "matched" ? (
                                <span className="text-emerald-600">—</span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {line.appInvoiceId && (
                                <Link
                                  href={`/suppliers/${supplierId}`}
                                  className="text-xs text-primary hover:underline"
                                >
                                  Ver →
                                </Link>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Sin mayor todavía — mostrar facturas de la app */
            reconciliation && reconciliation.lines.length > 0 && (
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="px-5 py-3 border-b border-border">
                  <p className="text-sm text-muted-foreground">
                    Facturas registradas en la app para este período ({reconciliation.lines.length}).
                    Sube el mayor del proveedor para comparar.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Nº Factura</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Fecha</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Importe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {reconciliation.lines.map((line, i) => (
                        <tr key={i}>
                          <td className="px-4 py-3 font-mono text-xs">
                            {line.invoiceNumber ?? <span className="text-muted-foreground italic">Sin número</span>}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{line.appDate}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatEuros(line.appAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </div>
      ) : (
        /* Sin filtro: instrucciones */
        <div className="rounded-lg border border-border bg-card px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Selecciona un <strong>proveedor</strong>, un <strong>año</strong> y un <strong>trimestre</strong> arriba para ver
            la comparación entre el mayor del proveedor y las facturas registradas en la app.
          </p>
        </div>
      )}
    </div>
  );
}
