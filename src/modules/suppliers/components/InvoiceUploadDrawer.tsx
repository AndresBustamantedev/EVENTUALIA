"use client";

import { useState } from "react";

interface Props {
  /** Contenido del tab "Escáner múltiple" (BundleSection renderizado en servidor) */
  ScannerSlot: React.ReactNode;
  /** Contenido del tab "Factura individual" (InvoiceForm renderizado en servidor) */
  InvoiceSlot: React.ReactNode;
  onClose: () => void;
}

type Tab = "scanner" | "individual";

export function InvoiceUploadDrawer({ ScannerSlot, InvoiceSlot, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("scanner");

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Overlay semitransparente */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel lateral */}
      <div className="relative z-10 w-full max-w-xl h-full bg-card border-l shadow-2xl flex flex-col overflow-hidden">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h2 className="font-semibold text-base">Subir factura</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b shrink-0">
          <button
            type="button"
            onClick={() => setTab("scanner")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              tab === "scanner"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            📷 Escáner múltiple
          </button>
          <button
            type="button"
            onClick={() => setTab("individual")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              tab === "individual"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            📝 Factura individual
          </button>
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "scanner"   && ScannerSlot}
          {tab === "individual" && InvoiceSlot}
        </div>
      </div>
    </div>
  );
}
