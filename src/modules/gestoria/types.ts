/**
 * Tipos del módulo de Gestoría — Cruz Blanca Gestión
 */

export type GestoriaStatus = "DRAFT" | "SENT" | "CONFIRMED";

export const GESTORIA_STATUS_LABELS: Record<GestoriaStatus, string> = {
  DRAFT:     "En preparación",
  SENT:      "Enviado a la gestora",
  CONFIRMED: "Confirmado",
};

export const QUARTER_LABELS: Record<number, string> = {
  1: "1er trimestre (Ene–Mar)",
  2: "2º trimestre (Abr–Jun)",
  3: "3er trimestre (Jul–Sep)",
  4: "4º trimestre (Oct–Dic)",
};

// ── Paquete ───────────────────────────────────────────────────

export interface GestoriaPackageRow {
  id:          string;
  year:        number;
  quarter:     number;
  description: string | null;
  status:      GestoriaStatus;
  sentAt:      string | null;     // ISO
  confirmedAt: string | null;     // ISO
  notes:       string | null;
  itemCount:   number;
  totalInCents: number;           // suma de facturas
  createdAt:   string;
}

// ── Detalle de ítem (factura dentro de un paquete) ───────────

export interface GestoriaItemRow {
  id:            string;          // GestoriaPackageItem.id
  invoiceId:     string;
  invoiceNumber: string | null;
  invoiceDate:   string;          // YYYY-MM-DD
  supplierName:  string;
  supplierId:    string;
  totalInCents:  number;
  isPaid:        boolean;
  fileId:        string | null;   // PDF individual directo
  bundleFileId:  string | null;   // PDF del escáner (bundle)
  addedAt:       string;
}

// ── Factura candidata (para añadir a un paquete) ─────────────

export interface CandidateInvoice {
  id:            string;
  invoiceNumber: string | null;
  invoiceDate:   string;
  supplierName:  string;
  supplierId:    string;
  totalInCents:  number;
  isPaid:        boolean;
}

// ── Server Action states ──────────────────────────────────────

export interface GestoriaPackageFormState {
  error?:       string;
  success?:     boolean;
  packageId?:   string;
  fieldErrors?: Record<string, string[]>;
}

export interface GestoriaActionState {
  error?:   string;
  success?: boolean;
}
