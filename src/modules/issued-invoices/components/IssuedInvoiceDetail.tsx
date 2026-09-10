"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import type { IssuedInvoiceRow, VoidInvoiceState } from "../types";
import { STATUS_LABELS, STATUS_COLORS } from "../types";
import { voidIssuedInvoiceAction } from "../actions/issuedInvoices";
import { sendIssuedInvoiceEmailAction } from "../actions/email";
import type { SendInvoiceEmailState } from "../actions/email";

function fmt(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

interface Props {
  invoice: IssuedInvoiceRow;
  canWrite: boolean;
}

export function IssuedInvoiceDetail({ invoice, canWrite }: Props) {
  const [showVoidForm, setShowVoidForm] = useState(false);

  // Anular
  const boundVoid = voidIssuedInvoiceAction.bind(null, invoice.id);
  const [voidState, voidAction, voidPending] = useActionState<VoidInvoiceState, FormData>(
    boundVoid, {}
  );

  // Enviar por email
  const [emailState, setEmailState] = useState<SendInvoiceEmailState>({});
  const [isSending, startSend] = useTransition();

  function handleSendEmail() {
    setEmailState({});
    startSend(async () => {
      const res = await sendIssuedInvoiceEmailAction(invoice.id);
      setEmailState(res);
    });
  }

  const isActive = invoice.status === "ACTIVE";

  // Desglose IVA
  const vatGroups: Record<number, { base: number; vat: number }> = {};
  for (const l of invoice.lines) {
    if (!vatGroups[l.vatRate]) vatGroups[l.vatRate] = { base: 0, vat: 0 };
    vatGroups[l.vatRate].base += l.subtotalInCents;
    vatGroups[l.vatRate].vat += l.vatAmountInCents;
  }
  const vatRates = Object.keys(vatGroups).map(Number).sort();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ── Cabecera ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{invoice.invoiceNumber}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[invoice.status]}`}>
              {STATUS_LABELS[invoice.status]}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Fecha: {fmtDate(invoice.issueDate)}
            {invoice.rectifiesNumber && (
              <> · Rectifica: <Link href={`/facturas-emitidas/${invoice.rectifiesId}`} className="text-primary hover:underline">{invoice.rectifiesNumber}</Link></>
            )}
            {invoice.rectifiedByNumber && (
              <> · Sustituida por: <Link href={`/facturas-emitidas/${invoice.rectifiedById}`} className="text-amber-600 hover:underline">{invoice.rectifiedByNumber}</Link></>
            )}
          </p>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <a
            href={`/api/files/issued-invoice-pdf/${invoice.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted flex items-center gap-1.5"
          >
            📄 Ver PDF
          </a>

          {/* Botón enviar por email — visible si hay email de cliente */}
          {canWrite && isActive && invoice.clientEmail && (
            <button
              type="button"
              onClick={handleSendEmail}
              disabled={isSending}
              title={`Enviar a ${invoice.clientEmail}`}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSending ? "Enviando…" : "✉ Enviar al cliente"}
            </button>
          )}

          {canWrite && isActive && (
            <>
              <Link
                href={`/facturas-emitidas/${invoice.id}/edit`}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                ✏️ Editar
              </Link>
              <Link
                href={`/facturas-emitidas/${invoice.id}/rectificativa`}
                className="rounded-md bg-amber-600 text-white px-4 py-2 text-sm hover:bg-amber-700"
              >
                🔁 Rectificativa
              </Link>
              <button
                type="button"
                onClick={() => setShowVoidForm(v => !v)}
                className="rounded-md bg-destructive/10 text-destructive border border-destructive/30 px-4 py-2 text-sm hover:bg-destructive/20"
              >
                🚫 Anular
              </button>
            </>
          )}
        </div>
      </div>

      {/* Resultado envío email */}
      {emailState.success && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
          <span>✓</span> {emailState.success}
        </div>
      )}
      {emailState.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
          {emailState.error}
        </div>
      )}

      {/* Void result */}
      {voidState.success && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          {voidState.success}
        </div>
      )}
      {voidState.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
          {voidState.error}
        </div>
      )}

      {/* Formulario de anulación */}
      {showVoidForm && isActive && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 space-y-4">
          <p className="font-semibold text-destructive text-sm">Anular factura {invoice.invoiceNumber}</p>
          <p className="text-xs text-muted-foreground">
            La factura quedará marcada como ANULADA. El registro se conserva.
            Para emitir una factura con datos corregidos, usa la opción «Rectificativa» en su lugar.
          </p>
          <form action={voidAction} className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="reason">Motivo de anulación (opcional)</label>
              <input id="reason" name="reason" placeholder="Error en datos, factura no enviada..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive" />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={voidPending}
                className="rounded-md bg-destructive text-white px-4 py-2 text-sm hover:bg-destructive/90 disabled:opacity-50">
                {voidPending ? "Anulando…" : "Confirmar anulación"}
              </button>
              <button type="button" onClick={() => setShowVoidForm(false)}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Aviso anulada */}
      {invoice.status === "VOIDED" && invoice.voidReason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>Motivo de anulación:</strong> {invoice.voidReason}
        </div>
      )}

      {/* Cliente */}
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Cliente</p>
        <p className="font-semibold">{invoice.clientName}</p>
        {invoice.clientNif && <p className="text-sm text-muted-foreground">NIF/CIF: {invoice.clientNif}</p>}
        {invoice.clientAddress && <p className="text-sm text-muted-foreground">{invoice.clientAddress}</p>}
        {invoice.clientPhone && <p className="text-sm text-muted-foreground">Tel: {invoice.clientPhone}</p>}
        {invoice.clientEmail && (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <span>✉</span>
            <a href={`mailto:${invoice.clientEmail}`} className="hover:underline">
              {invoice.clientEmail}
            </a>
          </p>
        )}
      </div>

      {/* Líneas */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Descripción</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Precio</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Cant.</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">IVA</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Base</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">IVA (€)</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invoice.lines.map(l => (
              <tr key={l.id}>
                <td className="px-4 py-3">{l.description}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{fmt(l.unitPriceInCents)}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {l.quantity.toLocaleString("es-ES", { minimumFractionDigits: l.quantity % 1 === 0 ? 2 : 3 })}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">{l.vatRate.toFixed(0)}%</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{fmt(l.subtotalInCents)}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{fmt(l.vatAmountInCents)}</td>
                <td className="px-4 py-3 text-right font-medium">{fmt(l.lineTotalInCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totales */}
      <div className="flex justify-end">
        <div className="w-72 rounded-lg border border-border bg-card overflow-hidden">
          <div className="bg-muted/30 px-4 py-2 grid grid-cols-3 text-xs font-semibold text-muted-foreground uppercase">
            <span>Base</span><span className="text-center">IVA %</span><span className="text-right">Total IVA</span>
          </div>
          {vatRates.map(rate => (
            <div key={rate} className="px-4 py-2 grid grid-cols-3 text-sm border-t border-border">
              <span>{fmt(vatGroups[rate].base)}</span>
              <span className="text-center text-muted-foreground">{rate.toFixed(0)}%</span>
              <span className="text-right text-muted-foreground">{fmt(vatGroups[rate].vat)}</span>
            </div>
          ))}
          {vatRates.length > 1 && (
            <div className="px-4 py-2 grid grid-cols-3 text-sm font-medium border-t-2 border-border">
              <span>{fmt(invoice.baseInCents)}</span>
              <span className="text-center text-muted-foreground">Total</span>
              <span className="text-right">{fmt(invoice.vatInCents)}</span>
            </div>
          )}
          <div className="px-4 py-3 bg-primary text-white flex justify-between items-center">
            <span className="text-sm font-semibold">TOTAL A PAGAR</span>
            <span className="text-lg font-bold">{fmt(invoice.totalInCents)}</span>
          </div>
        </div>
      </div>

      {/* Notas */}
      {invoice.notes && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Notas: </span>{invoice.notes}
        </div>
      )}

      <div className="pt-2">
        <Link href="/facturas-emitidas" className="text-sm text-muted-foreground hover:underline">
          ← Volver al listado
        </Link>
      </div>
    </div>
  );
}
