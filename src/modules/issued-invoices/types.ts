/**
 * Tipos — Módulo Facturas Emitidas
 */

export type IssuedInvoiceStatus = "ACTIVE" | "VOIDED" | "REPLACED";

export const STATUS_LABELS: Record<IssuedInvoiceStatus, string> = {
  ACTIVE:   "Activa",
  VOIDED:   "Anulada",
  REPLACED: "Sustituida",
};

export const STATUS_COLORS: Record<IssuedInvoiceStatus, string> = {
  ACTIVE:   "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  VOIDED:   "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  REPLACED: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

export interface IssuedInvoiceLineRow {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unitPriceInCents: number;
  vatRate: number;
  // calculados
  subtotalInCents: number;   // quantity * unitPrice
  vatAmountInCents: number;  // subtotal * vatRate / 100
  lineTotalInCents: number;  // subtotal + vatAmount
}

export interface IssuedInvoiceRow {
  id: string;
  invoiceNumber: string;
  issueDate: string;        // YYYY-MM-DD
  status: IssuedInvoiceStatus;
  rectifiesId: string | null;
  rectifiesNumber: string | null; // número de la factura original
  rectifiedById: string | null;
  rectifiedByNumber: string | null;
  clientName: string;
  clientNif: string | null;
  clientAddress: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  baseInCents: number;
  vatInCents: number;
  totalInCents: number;
  notes: string | null;
  voidReason: string | null;
  lines: IssuedInvoiceLineRow[];
  createdAt: string;
}

// ── Estados de formulario ─────────────────────────────────────

export interface IssuedInvoiceFormState {
  error?: string;
  success?: string;
  id?: string;
}

export interface VoidInvoiceState {
  error?: string;
  success?: string;
}
