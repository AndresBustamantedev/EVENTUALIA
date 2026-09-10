/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { headers } from "next/headers";
import { requirePermission } from "@/core/auth/session";
import { getIssuedInvoicePdfData } from "./issuedInvoices";

export interface SendInvoiceEmailState {
  error?: string;
  success?: string;
}

export async function sendIssuedInvoiceEmailAction(
  invoiceId: string,
): Promise<SendInvoiceEmailState> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso para enviar facturas." }; }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: "No está configurada la clave RESEND_API_KEY en el servidor." };

  const data = await getIssuedInvoicePdfData(invoiceId);
  if (!data) return { error: "Factura no encontrada." };
  if (!data.clientEmail) return { error: "El cliente no tiene dirección de email." };
  if (data.status !== "ACTIVE") return { error: "Solo se pueden enviar facturas activas." };

  // Fetch PDF using the existing API route (re-uses the same PDF renderer)
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const pdfUrl = `${protocol}://${host}/api/files/issued-invoice-pdf/${invoiceId}`;

  let pdfBuffer: Buffer;
  try {
    const res = await fetch(pdfUrl, {
      headers: { cookie: hdrs.get("cookie") ?? "" },
    });
    if (!res.ok) return { error: "Error al generar el PDF de la factura." };
    pdfBuffer = Buffer.from(await res.arrayBuffer());
  } catch {
    return { error: "No se pudo generar el PDF para adjuntar." };
  }

  // Lazy import so the module is only loaded when actually sending
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "facturas@eventualia.es";
  const totalFormatted = (data.totalInCents / 100).toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color: #1a1a2e; margin-bottom: 4px;">Factura ${data.invoiceNumber}</h2>
      <p style="color: #666; margin-top: 0;">Fecha: ${data.issueDate}</p>
      <p>Estimado/a ${data.clientName},</p>
      <p>Le enviamos adjunta la factura <strong>${data.invoiceNumber}</strong>.</p>

      <table style="width:100%; border-collapse:collapse; margin:20px 0; font-size:14px;">
        <tr style="background:#f5f5f5;">
          <td style="padding:9px 14px; font-weight:bold; border-bottom:1px solid #e0e0e0;">Nº Factura</td>
          <td style="padding:9px 14px; border-bottom:1px solid #e0e0e0;">${data.invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding:9px 14px; font-weight:bold; border-bottom:1px solid #e0e0e0;">Fecha</td>
          <td style="padding:9px 14px; border-bottom:1px solid #e0e0e0;">${data.issueDate}</td>
        </tr>
        <tr style="background:#f5f5f5;">
          <td style="padding:9px 14px; font-weight:bold; border-bottom:1px solid #e0e0e0;">Base imponible</td>
          <td style="padding:9px 14px; border-bottom:1px solid #e0e0e0;">${(data.baseInCents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €</td>
        </tr>
        <tr>
          <td style="padding:9px 14px; font-weight:bold; border-bottom:1px solid #e0e0e0;">IVA</td>
          <td style="padding:9px 14px; border-bottom:1px solid #e0e0e0;">${(data.vatInCents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €</td>
        </tr>
        <tr style="background:#1a1a2e; color:#fff;">
          <td style="padding:11px 14px; font-weight:bold;">TOTAL</td>
          <td style="padding:11px 14px; font-weight:bold; font-size:1.1em;">${totalFormatted} €</td>
        </tr>
      </table>

      <p style="color:#555; font-size:0.9em;">El PDF de la factura se adjunta a este correo.</p>
      ${data.notes ? `<p style="color:#666; font-size:0.9em; font-style:italic;">Notas: ${data.notes}</p>` : ""}

      <hr style="border:none; border-top:1px solid #eee; margin:24px 0;" />
      <p style="color:#999; font-size:0.82em; margin:0;">
        ${data.companyName}${data.companyAddress ? ` &middot; ${data.companyAddress}` : ""}${data.companyCif ? ` &middot; CIF: ${data.companyCif}` : ""}${data.companyEmail ? ` &middot; ${data.companyEmail}` : ""}
      </p>
    </div>
  `;

  const filename = `Factura_${data.invoiceNumber.replace(/[/\\:*?"<>|]/g, "-")}.pdf`;

  const result = await resend.emails.send({
    from: `${data.companyName} <${fromEmail}>`,
    to:   [data.clientEmail],
    subject: `Factura ${data.invoiceNumber} – ${data.companyName}`,
    html,
    attachments: [{ filename, content: pdfBuffer }],
  });

  if (result.error) {
    return { error: `Error al enviar: ${result.error.message}` };
  }

  return { success: `Email enviado correctamente a ${data.clientEmail}` };
}
