"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { SupplierRow } from "@/modules/suppliers/types";
import type { AppAlert } from "@/modules/suppliers/actions/alerts";
import { dismissAlertAction, undismissAlertAction } from "@/modules/suppliers/actions/alerts";
import { GlobalScanUploadButton } from "@/modules/suppliers/components/GlobalScanUploadButton";

interface SupplierCard {
  id: string;
  name: string;
  count: number;
  lastDate: string | null;
}

interface Props {
  supplierCards: SupplierCard[];
  suppliers: SupplierRow[];
  unclassifiedCount: number;
  canWrite: boolean;
  alerts: AppAlert[];
  dismissedAlerts: AppAlert[];
  /** ID del bucket "Sin asignar" */
  unassignedSupplierId: string;
  /** Cuántas facturas hay en el bucket "Sin asignar" */
  unassignedCount: number;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const BADGE_COLORS = [
  "bg-violet-600", "bg-emerald-600", "bg-sky-600",
  "bg-rose-600",   "bg-amber-600",   "bg-teal-600",
  "bg-indigo-600", "bg-pink-600",
];
function badgeColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return BADGE_COLORS[h % BADGE_COLORS.length];
}

function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

const LEVEL_STYLES = {
  error:   "border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700",
  warning: "border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700",
  info:    "border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700",
};
const LEVEL_TEXT = {
  error:   "text-red-700 dark:text-red-400",
  warning: "text-amber-700 dark:text-amber-400",
  info:    "text-blue-700 dark:text-blue-400",
};
const LEVEL_SUBTEXT = {
  error:   "text-red-600 dark:text-red-500",
  warning: "text-amber-600 dark:text-amber-500",
  info:    "text-blue-600 dark:text-blue-500",
};

export function InvoicesIndexClient({
  supplierCards, suppliers, unclassifiedCount, canWrite, alerts, dismissedAlerts,
  unassignedSupplierId, unassignedCount,
}: Props) {
  const router = useRouter();
  const [search, setSearch]         = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [pickerVal, setPickerVal]   = useState("");
  const [dismissed, setDismissed]   = useState<Set<string>>(new Set());
  const [showScanner, setShowScanner] = useState(false);

  // ── Hidden alerts management ──────────────────────────────────
  const [showHidden, setShowHidden]   = useState(false);
  // Track locally restored alerts so we can remove them from the panel immediately
  const [restored, setRestored]       = useState<Set<string>>(new Set());
  const [isPending, startTransition]  = useTransition();

  const filtered = useMemo(() =>
    search.trim()
      ? supplierCards.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
      : supplierCards,
    [supplierCards, search]
  );

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id));

  // Dismissed alerts still relevant (from server) minus any we just restored
  const visibleDismissed = dismissedAlerts.filter(a => !restored.has(a.id));

  function handleUploadPicker() {
    if (pickerVal) router.push(`/invoices/${pickerVal}?upload=1`);
  }

  function dismiss(id: string) {
    setDismissed(prev => new Set([...prev, id]));
    void dismissAlertAction(id); // persists to DB in background
  }

  function undismiss(id: string) {
    setRestored(prev => new Set([...prev, id]));
    startTransition(async () => {
      await undismissAlertAction(id); // removes from DB, triggers revalidate
    });
  }

  return (
    <div className="space-y-6">

      {/* ── Cabecera ─────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Facturas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Selecciona un proveedor para consultar sus facturas.</p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <button
              type="button"
              onClick={() => { setShowScanner(v => !v); }}
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              📷 Subir escáner con IA
            </button>
            <Link
              href="/financiero/importar"
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              📥 Importar PDFs
            </Link>
            <button
              type="button"
              onClick={() => { setShowPicker(v => !v); setPickerVal(""); }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              ↑ Subir factura
            </button>
          </div>
        )}
      </div>

      {/* ── Panel del escáner con IA ─────────────────────── */}
      {showScanner && canWrite && (
        <GlobalScanUploadButton
          suppliers={suppliers}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* ── Picker de proveedor — inline arriba ──────────── */}
      {showPicker && canWrite && (
        <div className="rounded-xl border bg-card shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">¿Para qué proveedor?</h2>
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="text-muted-foreground hover:text-foreground text-lg leading-none"
            >
              ✕
            </button>
          </div>
          <select
            value={pickerVal}
            onChange={e => setPickerVal(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Seleccionar proveedor…</option>
            {suppliers.filter(s => s.isActive).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleUploadPicker}
              disabled={!pickerVal}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-primary/90"
            >
              Continuar →
            </button>
          </div>
        </div>
      )}

      {/* ── Panel de alertas ─────────────────────────────── */}
      {visibleAlerts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Alertas ({visibleAlerts.length})
            </p>
            {visibleDismissed.length > 0 && (
              <button
                type="button"
                onClick={() => setShowHidden(v => !v)}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                {visibleDismissed.length} oculta{visibleDismissed.length !== 1 ? "s" : ""} · {showHidden ? "Cerrar" : "Gestionar"}
              </button>
            )}
          </div>
          {visibleAlerts.map(alert => (
            <div
              key={alert.id}
              className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${LEVEL_STYLES[alert.level]}`}
            >
              <span className="text-lg shrink-0 mt-0.5">{alert.icon}</span>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm ${LEVEL_TEXT[alert.level]}`}>{alert.title}</p>
                <p className={`text-xs mt-0.5 ${LEVEL_SUBTEXT[alert.level]}`}>{alert.detail}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {alert.href && (
                  <Link
                    href={alert.href}
                    className={`text-xs font-medium underline underline-offset-2 ${LEVEL_TEXT[alert.level]}`}
                  >
                    Ver →
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => dismiss(alert.id)}
                  className={`text-xs opacity-60 hover:opacity-100 ${LEVEL_TEXT[alert.level]}`}
                  title="Ocultar esta alerta permanentemente"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No active alerts but some dismissed — show link to manage */}
      {visibleAlerts.length === 0 && visibleDismissed.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Alertas (0)
          </p>
          <button
            type="button"
            onClick={() => setShowHidden(v => !v)}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            {visibleDismissed.length} oculta{visibleDismissed.length !== 1 ? "s" : ""} · {showHidden ? "Cerrar" : "Gestionar"}
          </button>
        </div>
      )}

      {/* ── Panel de alertas ocultas ──────────────────────── */}
      {showHidden && visibleDismissed.length > 0 && (
        <div className="rounded-xl border border-dashed bg-muted/30 p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Alertas ocultas — siguen siendo relevantes
          </p>
          {visibleDismissed.map(alert => (
            <div
              key={alert.id}
              className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3 opacity-70"
            >
              <span className="text-lg shrink-0 mt-0.5">{alert.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm line-through text-muted-foreground">{alert.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{alert.detail}</p>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => undismiss(alert.id)}
                className="shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
                title="Volver a mostrar esta alerta"
              >
                Restaurar
              </button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Estas alertas las ocultaste con ✕. Pulsa «Restaurar» para que vuelvan a aparecer.
          </p>
        </div>
      )}

      {/* ── Alerta: facturas sin número ───────────────────── */}
      {unclassifiedCount > 0 && (
        <div className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${LEVEL_STYLES.warning}`}>
          <span className="text-lg shrink-0 mt-0.5">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm ${LEVEL_TEXT.warning}`}>
              {unclassifiedCount} factura{unclassifiedCount !== 1 ? "s" : ""} sin número asignado
            </p>
            <p className={`text-xs mt-0.5 ${LEVEL_SUBTEXT.warning}`}>
              Revisa las facturas importadas desde escáneres que no tienen número de factura.
            </p>
          </div>
        </div>
      )}

      {/* ── Búsqueda ─────────────────────────────────────── */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">🔍</span>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar proveedor…"
          className="w-full rounded-lg border bg-background pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* ── Grid de tarjetas ─────────────────────────────── */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {search ? "No se encontraron proveedores con ese nombre." : "No hay proveedores registrados."}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Tarjeta especial "Sin asignar" — siempre al principio si hay facturas */}
          {unassignedCount > 0 && (
            <Link
              href={`/invoices/${unassignedSupplierId}`}
              className="group flex items-center gap-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-900/10 p-4 hover:border-amber-500 hover:shadow-sm transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-amber-400 dark:bg-amber-600 flex items-center justify-center shrink-0 text-xl">
                🗂
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-amber-800 dark:text-amber-300 group-hover:text-amber-900 transition-colors">
                  Sin asignar
                </p>
                <p className="text-xs text-amber-700/70 dark:text-amber-400/70 mt-0.5">
                  {unassignedCount} factura{unassignedCount !== 1 ? "s" : ""} pendiente{unassignedCount !== 1 ? "s" : ""} de clasificar
                </p>
              </div>
              <span className="text-amber-500 group-hover:text-amber-700 transition-colors text-sm shrink-0">›</span>
            </Link>
          )}
          {filtered.map(s => (
            <Link
              key={s.id}
              href={`/invoices/${s.id}`}
              className="group flex items-center gap-3 rounded-xl border bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all"
            >
              <div className={`${badgeColor(s.name)} w-10 h-10 rounded-lg flex items-center justify-center shrink-0`}>
                <span className="text-white text-sm font-bold">{initials(s.name)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{s.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {s.count} {s.count === 1 ? "factura" : "facturas"}
                  {s.lastDate && ` · Última: ${fmtDate(s.lastDate)}`}
                </p>
              </div>
              <span className="text-muted-foreground group-hover:text-primary transition-colors text-sm shrink-0">›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
