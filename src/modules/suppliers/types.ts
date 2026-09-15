/**
 * Tipos del módulo de Proveedores — Cruz Blanca Gestión
 */

export type OrderStatus = "PENDING" | "SENT" | "RECEIVED" | "CANCELLED";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pendiente",
  SENT: "Enviado",
  RECEIVED: "Recibido",
  CANCELLED: "Cancelado",
};

// ── Proveedor ─────────────────────────────────────────────────

export interface TagRow {
  id:    string;
  name:  string;
  color: string;
}

export type SupplierBranch = "RESTAURANT" | "CONSTRUCTION" | "BOTH";

export interface SupplierRow {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  website: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  branch: SupplierBranch;
  tags: TagRow[];
}

// ── Producto genérico ─────────────────────────────────────────

export interface ProductRow {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  notes: string | null;
  isActive: boolean;
}

// ── Precio por proveedor ──────────────────────────────────────

export interface SupplierProductRow {
  id: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  productUnit: string | null;
  presentation: string;
  quantity: number;       // unidades base
  priceInCents: number;
  pricePerUnit: number;   // céntimos / unidad base (calculado)
  reference: string | null;
  isActive: boolean;
  priceUpdatedAt: string | null; // ISO datetime de la última actualización de tarifa
}

// ── Factura ───────────────────────────────────────────────────

export interface VatLineRow {
  vatRate: number;           // 4, 10, 21
  baseAmountInCents: number;
  taxInCents: number;
}

export interface InvoiceRow {
  id: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  dueDate: string | null;
  totalInCents: number;
  taxInCents: number | null;
  baseAmountInCents: number | null;
  vatRate: number | null;
  vatLines: VatLineRow[];
  isPaid: boolean;
  paidAt: string | null;
  pendingReview: boolean;
  notes: string | null;
  fileId: string | null;       // storedFileId para descarga individual
  bundleId: string | null;     // bundle del que proviene (si aplica)
  bundleDate: string | null;   // fecha del bundle (YYYY-MM-DD)
  bundleFileId: string | null; // storedFileId del bundle para ver el PDF
  createdAt: string;
  // Gestoría
  gestoriaPackageId:      string | null;
  gestoriaPackageYear:    number | null;
  gestoriaPackageQuarter: number | null;
  gestoriaStatus:         "SENT" | "CONFIRMED" | null;
}

// ── Pedido ────────────────────────────────────────────────────

export interface OrderItemRow {
  id: string;
  productId: string;
  productName: string;
  description: string;
  quantity: number;
  unitPrice: number; // céntimos
}

export interface OrderRow {
  id: string;
  supplierId: string;
  supplierName: string;
  orderDate: string;
  expectedDate: string | null;
  receivedAt: string | null;
  status: OrderStatus;
  notes: string | null;
  items: OrderItemRow[];
  createdAt: string;
}

// ── Comparación de precios ────────────────────────────────────

export interface PriceComparisonRow {
  productId: string;
  productName: string;
  productUnit: string | null;
  offers: {
    supplierId: string;
    supplierName: string;
    supplierProductId: string;
    presentation: string;
    quantity: number;
    priceInCents: number;
    pricePerUnit: number; // céntimos / unidad base
    reference: string | null;
  }[];
}

// ── Server Action states ──────────────────────────────────────

export interface SupplierFormState {
  error?: string;
  success?: boolean;
  fieldErrors?: Record<string, string[]>;
  supplierId?: string;
}

export interface InvoiceFormState {
  error?: string;
  success?: boolean;
  fieldErrors?: Record<string, string[]>;
  invoiceId?: string;
}

export interface OrderFormState {
  error?: string;
  success?: boolean;
  fieldErrors?: Record<string, string[]>;
  orderId?: string;
}

export interface ProductFormState {
  error?: string;
  success?: boolean;
  fieldErrors?: Record<string, string[]>;
  productId?: string;
}

export interface SupplierProductFormState {
  error?: string;
  success?: boolean;
  fieldErrors?: Record<string, string[]>;
}

// ── Bundles ──────────────────────────────────────────────────

export interface BundleRow {
  id: string;
  supplierId: string;
  description: string | null;
  bundleDate: string;           // YYYY-MM-DD
  pageCount: number | null;
  fileId: string;               // StoredFile id
  invoiceCount: number;
  createdAt: string;
}

export interface BundleFormState {
  error?: string;
  success?: boolean;
  bundleId?: string;
  fieldErrors?: Record<string, string[]>;
}

// ── Líneas de factura ─────────────────────────────────────────

export interface InvoiceLineRow {
  id: string;
  invoiceId: string;
  rawDescription: string;
  quantity: number | null;         // decimal
  unitPriceInCents: number | null;
  totalInCents: number | null;
  productId: string | null;        // producto vinculado si existe
  productName?: string | null;     // nombre del producto (join opcional)
}
