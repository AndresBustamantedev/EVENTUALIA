"use client";

import { useState } from "react";
import { BundleUploadForm } from "./BundleUploadForm";
import { BundleExtractButton } from "./BundleExtractButton";
import { createBundleAction } from "@/modules/suppliers/actions/bundles";
import { BundleDeleteButton } from "./BundleDeleteButton";
import type { BundleRow } from "@/modules/suppliers/types";

interface Props {
  supplierId: string;
  bundles: BundleRow[];
  canWrite: boolean;
}

function quarterLabel(dateStr: string): string {
  const [yearStr, monthStr] = dateStr.split("-");
  const q = Math.ceil(parseInt(monthStr, 10) / 3);
  return `T${q} · ${yearStr}`;
}

export function BundleSection({ supplierId, bundles, canWrite }: Props) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Escáneres múltiples ({bundles.length})
        </h3>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="text-xs text-primary hover:underline"
          >
            {showForm ? "Cancelar" : "+ Subir escáner"}
          </button>
        )}
      </div>

      {showForm && canWrite && (
        <div className="rounded-lg border p-4 bg-muted/20">
          <BundleUploadForm
            supplierId={supplierId}
            action={createBundleAction}
            onSuccess={() => setShowForm(false)}
          />
        </div>
      )}

      {bundles.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          Sin escáneres múltiples. Úsalos cuando escanees varias facturas en un solo PDF.
        </p>
      ) : (
        <div className="space-y-3">
          {bundles.map((b) => (
            <div key={b.id} className="rounded-lg border px-4 py-3 text-sm hover:bg-muted/10">
              {/* Cabecera del bundle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">
                      {b.description ?? "Escáner múltiple"}
                    </span>
                    <span className="shrink-0 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-semibold">
                      {quarterLabel(b.bundleDate)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {b.bundleDate}
                    {b.pageCount ? ` · ${b.pageCount} páginas` : ""}
                    {" · "}
                    <span className={b.invoiceCount > 0 ? "text-foreground font-medium" : "text-amber-600"}>
                      {b.invoiceCount} factura{b.invoiceCount !== 1 ? "s" : ""} registrada{b.invoiceCount !== 1 ? "s" : ""}
                    </span>
                  </p>
                </div>
                <a
                  href={`/api/files/bundles/${b.fileId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-4 shrink-0 inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
                >
                  Ver PDF
                </a>
              </div>

              {/* Extracción IA y borrado — solo si canWrite */}
              {canWrite && (
                <div className="mt-2 pt-2 border-t border-border/50 flex items-start justify-between gap-4">
                  <BundleExtractButton bundleId={b.id} supplierId={supplierId} />
                  <BundleDeleteButton
                    bundleId={b.id}
                    invoiceCount={b.invoiceCount}
                    description={b.description}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
