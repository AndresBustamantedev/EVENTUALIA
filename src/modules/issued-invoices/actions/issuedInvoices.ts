/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";
import type {
  IssuedInvoiceRow,
  IssuedInvoiceLineRow,
  IssuedInvoiceFormState,
  VoidInvoiceState,
} from "../types";

// ── Helpers ───────────────────────────────────────────────────

function calcLine(q: number, unitCents: number, vatRate: number): {
  subtotalInCents: number; vatAmountInCents: number; lineTotalInCents: number;
} {
  const subtotalInCents = Math.round(q * unitCents);
  const vatAmountInCents = Math.round(subtotalInCents * vatRate / 100);
  return { subtotalInCents, vatAmountInCents, lineTotalInCents: subtotalInCents + vatAmountInCents };
}

function mapLine(l: any): IssuedInvoiceLineRow {
  const q = parseFloat(String(l.quantity));
  const rate = parseFloat(String(l.vatRate));
  const { subtotalInCents, vatAmountInCents, lineTotalInCents } = calcLine(q, l.unitPriceInCents, rate);
  return {
    id: l.id,
    position: l.position,
    description: l.description,
    quantity: q,
    unitPriceInCents: l.unitPriceInCents,
    vatRate: rate,
    subtotalInCents,
    vatAmountInCents,
    lineTotalInCents,
  };
}

function mapInvoice(inv: any): IssuedInvoiceRow {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    issueDate: (inv.issueDate as Date).toISOString().split("T")[0],
    status: inv.status as any,
    rectifiesId: inv.rectifiesId ?? null,
    rectifiesNumber: inv.rectifies?.invoiceNumber ?? null,
    rectifiedById: inv.rectifiedBy?.[0]?.id ?? null,
    rectifiedByNumber: inv.rectifiedBy?.[0]?.invoiceNumber ?? null,
    clientName: inv.clientName,
    clientNif: inv.clientNif ?? null,
    clientAddress: inv.clientAddress ?? null,
    clientPhone: inv.clientPhone ?? null,
    clientEmail: inv.clientEmail ?? null,
    baseInCents: inv.baseInCents,
    vatInCents: inv.vatInCents,
    totalInCents: inv.totalInCents,
    notes: inv.notes ?? null,
    voidReason: inv.voidReason ?? null,
    lines: ((inv.lines ?? []) as any[]).sort((a: any, b: any) => a.position - b.position).map(mapLine),
    createdAt: (inv.createdAt as Date).toISOString(),
  };
}

const INVOICE_INCLUDE = {
  rectifies: { select: { invoiceNumber: true } },
  rectifiedBy: { select: { id: true, invoiceNumber: true }, take: 1 },
  lines: true,
};

// ── Listado ───────────────────────────────────────────────────

export async function listIssuedInvoices(): Promise<IssuedInvoiceRow[]> {
  await requirePermission("suppliers:read");
  const rows = await (prisma as any).issuedInvoice.findMany({
    include: INVOICE_INCLUDE,
    orderBy: { issueDate: "desc" },
  });
  return (rows as any[]).map(mapInvoice);
}

export async function getIssuedInvoice(id: string): Promise<IssuedInvoiceRow | null> {
  await requirePermission("suppliers:read");
  const row = await (prisma as any).issuedInvoice.findUnique({
    where: { id },
    include: INVOICE_INCLUDE,
  });
  if (!row) return null;
  return mapInvoice(row);
}

// ── Parsear líneas del FormData ────────────────────────────────
// Formato: line_0_desc, line_0_qty, line_0_price, line_0_vat, line_1_...
function parseLinesFromForm(formData: FormData) {
  const lines: { description: string; quantity: number; unitPriceInCents: number; vatRate: number }[] = [];
  let i = 0;
  while (formData.has(`line_${i}_desc`)) {
    const desc = (formData.get(`line_${i}_desc`) as string).trim();
    const qty = parseFloat(formData.get(`line_${i}_qty`) as string);
    const price = Math.round(parseFloat(formData.get(`line_${i}_price`) as string) * 100);
    const vat = parseFloat(formData.get(`line_${i}_vat`) as string);
    if (desc && !isNaN(qty) && !isNaN(price) && !isNaN(vat)) {
      lines.push({ description: desc, quantity: qty, unitPriceInCents: price, vatRate: vat });
    }
    i++;
  }
  return lines;
}

function calcTotals(lines: { quantity: number; unitPriceInCents: number; vatRate: number }[]) {
  let baseInCents = 0, vatInCents = 0;
  for (const l of lines) {
    const sub = Math.round(l.quantity * l.unitPriceInCents);
    const vat = Math.round(sub * l.vatRate / 100);
    baseInCents += sub;
    vatInCents += vat;
  }
  return { baseInCents, vatInCents, totalInCents: baseInCents + vatInCents };
}

// ── Crear ─────────────────────────────────────────────────────

export async function createIssuedInvoiceAction(
  _prev: IssuedInvoiceFormState,
  formData: FormData
): Promise<IssuedInvoiceFormState> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso para crear facturas." }; }

  const invoiceNumber = (formData.get("invoiceNumber") as string).trim();
  const issueDate = formData.get("issueDate") as string;
  const clientName = (formData.get("clientName") as string).trim();
  const clientNif = (formData.get("clientNif") as string)?.trim() || null;
  const clientAddress = (formData.get("clientAddress") as string)?.trim() || null;
  const clientPhone = (formData.get("clientPhone") as string)?.trim() || null;
  const clientEmail = (formData.get("clientEmail") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!invoiceNumber) return { error: "El número de factura es obligatorio." };
  if (!issueDate) return { error: "La fecha es obligatoria." };
  if (!clientName) return { error: "El nombre del cliente es obligatorio." };

  const lines = parseLinesFromForm(formData);
  if (lines.length === 0) return { error: "Añade al menos una línea." };

  const { baseInCents, vatInCents, totalInCents } = calcTotals(lines);

  // Comprobar duplicado de número
  const existing = await (prisma as any).issuedInvoice.findFirst({ where: { invoiceNumber } });
  if (existing) return { error: `Ya existe una factura con el número ${invoiceNumber}.` };

  try {
    const inv = await (prisma as any).issuedInvoice.create({
      data: {
        invoiceNumber,
        issueDate: new Date(issueDate),
        status: "ACTIVE",
        clientName,
        clientNif,
        clientAddress,
        clientPhone,
        clientEmail,
        baseInCents,
        vatInCents,
        totalInCents,
        notes,
        createdById: actor.id,
        lines: {
          create: lines.map((l, i) => ({
            position: i,
            description: l.description,
            quantity: l.quantity,
            unitPriceInCents: l.unitPriceInCents,
            vatRate: l.vatRate,
          })),
        },
      },
    });
    revalidatePath("/facturas-emitidas");
    return { success: "Factura creada.", id: inv.id };
  } catch (err: any) {
    return { error: err.message ?? "Error al guardar." };
  }
}

// ── Editar ────────────────────────────────────────────────────

export async function updateIssuedInvoiceAction(
  id: string,
  _prev: IssuedInvoiceFormState,
  formData: FormData
): Promise<IssuedInvoiceFormState> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); void actor; }
  catch { return { error: "Sin permiso." }; }

  const inv = await (prisma as any).issuedInvoice.findUnique({ where: { id } });
  if (!inv) return { error: "Factura no encontrada." };

  const invoiceNumber = (formData.get("invoiceNumber") as string).trim();
  const issueDate = formData.get("issueDate") as string;
  const clientName = (formData.get("clientName") as string).trim();
  const clientNif = (formData.get("clientNif") as string)?.trim() || null;
  const clientAddress = (formData.get("clientAddress") as string)?.trim() || null;
  const clientPhone = (formData.get("clientPhone") as string)?.trim() || null;
  const clientEmail = (formData.get("clientEmail") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!invoiceNumber || !issueDate || !clientName) return { error: "Campos obligatorios incompletos." };

  const lines = parseLinesFromForm(formData);
  if (lines.length === 0) return { error: "Añade al menos una línea." };

  // Comprobar duplicado solo si cambió el número
  if (invoiceNumber !== inv.invoiceNumber) {
    const dup = await (prisma as any).issuedInvoice.findFirst({ where: { invoiceNumber, id: { not: id } } });
    if (dup) return { error: `Ya existe una factura con el número ${invoiceNumber}.` };
  }

  const { baseInCents, vatInCents, totalInCents } = calcTotals(lines);

  try {
    await (prisma as any).issuedInvoice.update({
      where: { id },
      data: {
        invoiceNumber,
        issueDate: new Date(issueDate),
        clientName,
        clientNif,
        clientAddress,
        clientPhone,
        clientEmail,
        baseInCents,
        vatInCents,
        totalInCents,
        notes,
        lines: {
          deleteMany: {},
          create: lines.map((l, i) => ({
            position: i,
            description: l.description,
            quantity: l.quantity,
            unitPriceInCents: l.unitPriceInCents,
            vatRate: l.vatRate,
          })),
        },
      },
    });
    revalidatePath("/facturas-emitidas");
    revalidatePath(`/facturas-emitidas/${id}`);
    return { success: "Factura actualizada.", id };
  } catch (err: any) {
    return { error: err.message ?? "Error al actualizar." };
  }
}

// ── Anular ────────────────────────────────────────────────────

export async function voidIssuedInvoiceAction(
  id: string,
  _prev: VoidInvoiceState,
  formData: FormData
): Promise<VoidInvoiceState> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const reason = (formData.get("reason") as string)?.trim() || null;
  const inv = await (prisma as any).issuedInvoice.findUnique({ where: { id } });
  if (!inv) return { error: "Factura no encontrada." };
  if (inv.status !== "ACTIVE") return { error: "Solo se pueden anular facturas activas." };

  await (prisma as any).issuedInvoice.update({
    where: { id },
    data: { status: "VOIDED", voidReason: reason },
  });
  revalidatePath("/facturas-emitidas");
  revalidatePath(`/facturas-emitidas/${id}`);
  return { success: "Factura anulada." };
}

// ── Crear rectificativa ───────────────────────────────────────

export async function createRectificativaAction(
  originalId: string,
  _prev: IssuedInvoiceFormState,
  formData: FormData
): Promise<IssuedInvoiceFormState> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const original = await (prisma as any).issuedInvoice.findUnique({
    where: { id: originalId }, include: { lines: true }
  });
  if (!original) return { error: "Factura original no encontrada." };
  if (original.status !== "ACTIVE") return { error: "Solo se puede rectificar una factura activa." };

  const invoiceNumber = (formData.get("invoiceNumber") as string).trim();
  const issueDate = formData.get("issueDate") as string;
  const clientName = (formData.get("clientName") as string).trim();
  const clientNif = (formData.get("clientNif") as string)?.trim() || null;
  const clientAddress = (formData.get("clientAddress") as string)?.trim() || null;
  const clientPhone = (formData.get("clientPhone") as string)?.trim() || null;
  const clientEmail = (formData.get("clientEmail") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!invoiceNumber || !issueDate || !clientName) return { error: "Campos obligatorios incompletos." };

  const lines = parseLinesFromForm(formData);
  if (lines.length === 0) return { error: "Añade al menos una línea." };

  const dup = await (prisma as any).issuedInvoice.findFirst({ where: { invoiceNumber } });
  if (dup) return { error: `Ya existe una factura con el número ${invoiceNumber}.` };

  const { baseInCents, vatInCents, totalInCents } = calcTotals(lines);

  try {
    const [, newInv] = await (prisma as any).$transaction([
      (prisma as any).issuedInvoice.update({
        where: { id: originalId },
        data: { status: "REPLACED" },
      }),
      (prisma as any).issuedInvoice.create({
        data: {
          invoiceNumber,
          issueDate: new Date(issueDate),
          status: "ACTIVE",
          rectifiesId: originalId,
          clientName,
          clientNif,
          clientAddress,
          clientPhone,
          clientEmail,
          baseInCents,
          vatInCents,
          totalInCents,
          notes,
          createdById: actor.id,
          lines: {
            create: lines.map((l, i) => ({
              position: i,
              description: l.description,
              quantity: l.quantity,
              unitPriceInCents: l.unitPriceInCents,
              vatRate: l.vatRate,
            })),
          },
        },
      }),
    ]);
    revalidatePath("/facturas-emitidas");
    return { success: "Rectificativa creada.", id: newInv.id };
  } catch (err: any) {
    return { error: err.message ?? "Error al crear rectificativa." };
  }
}

// ── Datos para PDF ─────────────────────────────────────────────

export async function getIssuedInvoicePdfData(id: string) {
  await requirePermission("suppliers:read");
  const inv = await (prisma as any).issuedInvoice.findUnique({
    where: { id },
    include: { lines: { orderBy: { position: "asc" } }, rectifies: { select: { invoiceNumber: true } } },
  });
  if (!inv) return null;

  // Company settings
  const settings = await (prisma as any).appSetting.findMany({
    where: { key: { in: ["company.name", "company.address", "company.cif", "company.phone", "company.email", "company.signatureName"] } },
  });
  const cfg: Record<string, string> = {};
  for (const s of settings) cfg[s.key] = s.value;

  return {
    invoiceNumber: inv.invoiceNumber,
    issueDate: (inv.issueDate as Date).toISOString().split("T")[0],
    status: inv.status,
    rectifiesNumber: inv.rectifies?.invoiceNumber ?? null,
    clientName: inv.clientName,
    clientNif: inv.clientNif ?? null,
    clientAddress: inv.clientAddress ?? null,
    clientPhone: inv.clientPhone ?? null,
    clientEmail: inv.clientEmail ?? null,
    lines: ((inv.lines as any[]).map((l: any) => ({
      description: l.description,
      quantity: parseFloat(String(l.quantity)),
      unitPriceInCents: l.unitPriceInCents,
      vatRate: parseFloat(String(l.vatRate)),
    }))),
    baseInCents: inv.baseInCents,
    vatInCents: inv.vatInCents,
    totalInCents: inv.totalInCents,
    notes: inv.notes ?? null,
    companyName: cfg["company.name"] ?? "Cruz Blanca",
    companyAddress: cfg["company.address"] ?? "",
    companyCif: cfg["company.cif"] ?? "",
    companyPhone: cfg["company.phone"] ?? "",
    companyEmail: cfg["company.email"] ?? "",
    companySignatureName: cfg["company.signatureName"] ?? "",
  };
}
