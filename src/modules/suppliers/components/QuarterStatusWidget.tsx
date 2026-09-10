"use client";

/**
 * Widget de estado de un trimestre para un proveedor.
 * Muestra el progreso del flujo: Mayor → Revisión → Gestoría → Cerrado.
 * Se coloca en la cabecera de cada acordeón de trimestre.
 */
import { useState, useTransition } from "react";
import {
  toggleQuarterStatusAction,
  type QuarterStatusRow,
} from "@/modules/suppliers/actions/quarterStatus";

interface Props {
  supplierId: string;
  year:       number;
  quarter:    number;
  status:     QuarterStatusRow | null; // null = no existe aún
  canWrite:   boolean;
}

// ── Step definitions ──────────────────────────────────────────

interface Step {
  key:   "mayorRequested" | "mayorReceived" | "reconciled" | "sentToAccountant" | "closed";
  label: string;
  icon:  string;
  activeColor: string;
}

const STEPS: Step[] = [
  { key: "mayorRequested",   label: "Mayor solicitado",   icon: "📨", activeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  { key: "mayorReceived",    label: "Mayor recibido",     icon: "📥", activeColor: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" },
  { key: "reconciled",       label: "Facturas revisadas", icon: "✅", activeColor: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  { key: "sentToAccountant", label: "Enviado gestoría",   icon: "📤", activeColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  { key: "closed",           label: "Trimestre cerrado",  icon: "🔒", activeColor: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
];

// ── Component ─────────────────────────────────────────────────

export function QuarterStatusWidget({ supplierId, year, quarter, status, canWrite }: Props) {
  // Local optimistic state mirroring DB
  const [local, setLocal] = useState<Record<string, boolean>>(() => ({
    mayorRequested:   status?.mayorRequested   ?? false,
    mayorReceived:    status?.mayorReceived    ?? false,
    reconciled:       status?.reconciled       ?? false,
    sentToAccountant: status?.sentToAccountant ?? false,
    closed:           status?.closed           ?? false,
  }));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(key: Step["key"]) {
    if (!canWrite || isPending) return;
    const newVal = !local[key];
    setLocal(prev => ({ ...prev, [key]: newVal }));
    setError(null);
    startTransition(async () => {
      const res = await toggleQuarterStatusAction(supplierId, year, quarter, key, newVal);
      if (res.error) {
        setLocal(prev => ({ ...prev, [key]: !newVal })); // revert
        setError(res.error);
      }
    });
  }

  // Determine highest active step for the compact badge
  let highestActive = -1;
  STEPS.forEach((s, i) => { if (local[s.key]) highestActive = i; });
  const badgeStep = highestActive >= 0 ? STEPS[highestActive] : null;

  return (
    <div className="flex flex-col gap-1" onClick={e => e.stopPropagation()}>
      {/* Compact badge shown always */}
      {badgeStep ? (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badgeStep.activeColor}`}>
          {badgeStep.icon} {badgeStep.label}
        </span>
      ) : (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
          Sin gestionar
        </span>
      )}

      {/* Checklist — only visible to writers */}
      {canWrite && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {STEPS.map((step) => {
            const active = local[step.key];
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => toggle(step.key)}
                disabled={isPending}
                title={active ? `Desmarcar: ${step.label}` : `Marcar: ${step.label}`}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors disabled:opacity-50 border ${
                  active
                    ? `${step.activeColor} border-transparent font-medium`
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <span>{active ? "✓" : "○"}</span>
                <span className="hidden sm:inline">{step.label}</span>
                <span className="sm:hidden">{step.icon}</span>
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="text-xs text-destructive mt-0.5">{error}</p>}
    </div>
  );
}
