"use client";

import { useState } from "react";
import Link from "next/link";
import { InvoiceYearQuarterView } from "./InvoiceYearQuarterView";
import { InvoiceUploadDrawer } from "./InvoiceUploadDrawer";
import { UnassignedInvoicesView } from "./UnassignedInvoicesView";
import type { InvoiceRow, SupplierRow } from "@/modules/suppliers/types";

interface Props {
  supplier: SupplierRow;
  invoices: InvoiceRow[];
  canWrite: boolean;
  /** Slot: BundleSection renderizado en el servidor */
  ScannerSlot?: React.ReactNode;
  /** Slot: InvoiceForm renderizado en el servidor */
  InvoiceSlot?: React.ReactNode;
  /** Si true, abre el drawer al cargar (desde ?upload=1) */
  defaultOpen?: boolean;
  /** Si true, este proveedor es el bucket "Sin asignar" — muestra vista de reasignación */
  isUnassigned?: boolean;
  /** Lista de proveedores activos para el dropdown de reasignación */
  allSuppliers?: SupplierRow[];
}

export function InvoiceSupplierPageClient({
  supplier, invoices, canWrite,
  ScannerSlot, InvoiceSlot, defaultOpen = false,
  isUnassigned = false, allSuppliers = [],
}: Props) {
  const [showDrawer, setShowDrawer] = useState(defaultOpen);

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
            <Link href="/invoices" className="hover:text-foreground transition-colors">Facturas</Link>
            <span>›</span>
            <span className="text-foreground font-medium">{supplier.name}</span>
          </div>
          <h1 className="text-2xl font-bold">{supplier.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isUnassigned
              ? "Facturas importadas sin proveedor conocido — reasígnalas al proveedor correcto."
              : "Facturas organizadas por año y trimestre."}
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowDrawer(true)}
            className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            ↑ Subir factura
          </button>
        )}
      </div>

      {/* Vista principal */}
      {isUnassigned ? (
        <UnassignedInvoicesView invoices={invoices} suppliers={allSuppliers} />
      ) : invoices.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm mb-3">No hay facturas registradas para este proveedor.</p>
          {canWrite && (
            <button type="button" onClick={() => setShowDrawer(true)} className="text-sm text-primary hover:underline">
              Subir primera factura →
            </button>
          )}
        </div>
      ) : (
        <InvoiceYearQuarterView invoices={invoices} supplierId={supplier.id} canWrite={canWrite} />
      )}

      {/* Drawer de subida */}
      {showDrawer && canWrite && (
        <InvoiceUploadDrawer
          ScannerSlot={ScannerSlot}
          InvoiceSlot={InvoiceSlot}
          onClose={() => setShowDrawer(false)}
        />
      )}
    </div>
  );
}
