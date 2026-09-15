"use client";

import { useState } from "react";
import Link from "next/link";
import {
  QUARTER_LABELS,
  GESTORIA_STATUS_LABELS,
  type GestoriaPackageRow,
} from "@/modules/gestoria/types";
import { PackageDeleteButton } from "./PackageDeleteButton";

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT:     "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  SENT:      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  CONFIRMED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

function PackageCard({
  pkg, index, total, canWrite,
}: {
  pkg: GestoriaPackageRow;
  index: number;
  total: number;
  canWrite: boolean;
}) {
  const label = `${QUARTER_LABELS[pkg.quarter]} ${pkg.year}`;
  return (
    <div className="relative group">
      <Link
        href={`/gestoria/${pkg.id}`}
        className="block rounded-lg border p-4 hover:bg-muted/30 transition-colors pr-10"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{QUARTER_LABELS[pkg.quarter]} · {pkg.year}</span>
              {total > 1 && (
                <span className="text-xs text-muted-foreground">Envío {index + 1}</span>
              )}
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[pkg.status]}`}>
                {GESTORIA_STATUS_LABELS[pkg.status]}
              </span>
            </div>
            {pkg.description && (
              <p className="text-sm text-muted-foreground mt-0.5 truncate">{pkg.description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {pkg.itemCount} factura{pkg.itemCount !== 1 ? "s" : ""}
              {pkg.sentAt && ` · Enviado ${new Date(pkg.sentAt).toLocaleDateString("es-ES")}`}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-mono text-sm font-semibold">{formatEuros(pkg.totalInCents)}</p>
          </div>
        </div>
      </Link>
      {canWrite && (
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <PackageDeleteButton packageId={pkg.id} packageLabel={label} itemCount={pkg.itemCount} />
        </div>
      )}
    </div>
  );
}

interface Props {
  byYear: Record<number, GestoriaPackageRow[]>;
  years: number[];
  canWrite: boolean;
}

export function GestoriaYearAccordion({ byYear, years, canWrite }: Props) {
  const currentYear = new Date().getFullYear();
  const defaultYear = years.includes(currentYear) ? currentYear : (years[0] ?? 0);
  const [selectedYear, setSelectedYear] = useState<number>(defaultYear);

  const pkgs = byYear[selectedYear] ?? [];
  const totalEuros = pkgs.reduce((acc, p) => acc + p.totalInCents, 0);

  return (
    <div className="space-y-5">
      {/* ── Selector de año ── */}
      <div className="flex flex-wrap gap-2">
        {years.map((year) => (
          <button
            key={year}
            type="button"
            onClick={() => setSelectedYear(year)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              selectedYear === year
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {year}
          </button>
        ))}
      </div>

      {/* ── Resumen del año seleccionado ── */}
      <div className="flex items-center gap-6 rounded-lg border bg-muted/20 px-4 py-3">
        <div>
          <p className="text-xs text-muted-foreground">Paquetes</p>
          <p className="text-lg font-bold">{pkgs.length}</p>
        </div>
        <div className="w-px h-8 bg-border" />
        <div>
          <p className="text-xs text-muted-foreground">Total facturas</p>
          <p className="text-lg font-bold font-mono">{formatEuros(totalEuros)}</p>
        </div>
      </div>

      {/* ── Lista de paquetes ── */}
      <div className="space-y-2">
        {pkgs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Sin paquetes en {selectedYear}.
          </p>
        ) : (
          pkgs.map((pkg, idx, arr) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              index={idx}
              total={arr.length}
              canWrite={canWrite}
            />
          ))
        )}
      </div>
    </div>
  );
}
