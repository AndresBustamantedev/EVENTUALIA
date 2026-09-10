"use client";

/**
 * GenerateMenuPdfButton — genera el PDF del menú y ofrece imprimir.
 *
 * Botón "Generar PDF" (primera vez):
 *   - Llama al server action
 *   - Abre el PDF en una pestaña nueva
 *
 * Botón "Regenerar PDF" (ya existe PDF):
 *   - Actualiza la fecha del menú a hoy (para el flujo de menú diario reutilizable)
 *   - Genera el PDF con la nueva fecha
 *   - Abre el PDF en una pestaña nueva
 *
 * Botón "Imprimir":
 *   - Regenera el PDF (y actualiza la fecha a hoy si ya había PDF)
 *   - Lanza el diálogo de impresión del navegador
 */

import { useTransition, useRef, useState } from "react";
import { generateMenuPdfAction } from "@/modules/menu/actions/generatePdf";
import { updateMenuDateToTodayAction } from "@/modules/menu/actions/dailyMenus";

interface Props {
  menuId: string;
  currentPdfId?: string | null;
}

export function GenerateMenuPdfButton({ menuId, currentPdfId }: Props) {
  const [isPending, startTransition]           = useTransition();
  const [isPrinting, startPrintTransition]     = useTransition();
  const [dateWarning, setDateWarning]          = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const isWorking = isPending || isPrinting;

  /**
   * Cuando ya hay PDF (re-generación), actualiza la fecha del menú a hoy primero.
   * Si hay conflicto guarda el aviso pero sigue generando el PDF.
   */
  async function maybeUpdateDate(): Promise<void> {
    if (!currentPdfId) return; // primera generación: no tocar la fecha
    const res = await updateMenuDateToTodayAction(menuId);
    if (res.error) {
      setDateWarning(res.error);
    } else {
      setDateWarning(null);
    }
  }

  /** Genera PDF y lo abre en nueva pestaña para descarga/guardado */
  function handleGenerate() {
    setDateWarning(null);
    startTransition(async () => {
      await maybeUpdateDate();

      let result;
      try {
        result = await generateMenuPdfAction(menuId);
      } catch (e) {
        alert(`Error: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      if (!result || result.error) {
        alert(result?.error ?? "Error desconocido al generar el PDF.");
        return;
      }
      if (result.pdfId) {
        window.open(`/api/files/menu-pdf/${result.pdfId}`, "_blank", "noopener");
      }
    });
  }

  /** Regenera PDF y lanza el diálogo de impresión */
  function handlePrint() {
    setDateWarning(null);
    startPrintTransition(async () => {
      await maybeUpdateDate();

      let result;
      try {
        result = await generateMenuPdfAction(menuId);
      } catch (e) {
        alert(`Error: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      if (!result || result.error) {
        alert(result?.error ?? "Error desconocido al generar el PDF.");
        return;
      }
      if (!result.pdfId) return;

      const pdfUrl = `/api/files/menu-pdf/${result.pdfId}`;

      // Cargar PDF en iframe oculto y llamar a print()
      if (iframeRef.current) {
        document.body.removeChild(iframeRef.current);
        iframeRef.current = null;
      }
      const iframe = document.createElement("iframe");
      iframe.style.cssText =
        "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;";
      iframe.src = pdfUrl;
      document.body.appendChild(iframe);
      iframeRef.current = iframe;

      iframe.onload = () => {
        try {
          iframe.contentWindow?.print();
        } catch {
          window.open(pdfUrl, "_blank", "noopener");
        }
      };
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {/* Generar / Regenerar PDF → abre en nueva pestaña */}
        <button
          onClick={handleGenerate}
          disabled={isWorking}
          className="rounded-md border border-input px-3 py-1.5 text-sm
                     hover:bg-muted transition-colors disabled:opacity-50"
        >
          {isPending
            ? "Generando…"
            : currentPdfId
            ? "Regenerar PDF"
            : "Generar PDF"}
        </button>

        {/* Imprimir → regenera y lanza diálogo de impresión */}
        <button
          onClick={handlePrint}
          disabled={isWorking}
          className="rounded-md border border-input px-3 py-1.5 text-sm
                     hover:bg-muted transition-colors disabled:opacity-50"
        >
          {isPrinting ? "Preparando…" : "Imprimir"}
        </button>
      </div>

      {/* Aviso si hubo conflicto de fecha (se generó el PDF igualmente) */}
      {dateWarning && (
        <p className="text-xs text-amber-600 dark:text-amber-400 max-w-[220px] text-right">
          ⚠ {dateWarning}
        </p>
      )}
    </div>
  );
}
