import { z } from "zod";

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1, "Nombre obligatorio").max(200),
  contactName: z.string().trim().max(200).optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  taxId: z.string().trim().max(20).optional().or(z.literal("")),
  website: z.string().trim().url("URL inválida").max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const updateSupplierSchema = createSupplierSchema.extend({
  id: z.string().uuid(),
  isActive: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(1, "Nombre obligatorio").max(200),
  category: z.string().trim().max(100).optional().or(z.literal("")),
  unit: z.string().trim().max(20).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const updateProductSchema = createProductSchema.extend({
  id: z.string().uuid(),
  isActive: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});

export const createSupplierProductSchema = z.object({
  supplierId: z.string().uuid(),
  productId: z.string().uuid(),
  presentation: z.string().trim().min(1, "Presentación obligatoria").max(200),
  quantity: z.coerce.number().positive("Cantidad debe ser positiva"),
  priceInCents: z.coerce.number().int().nonnegative("Precio no puede ser negativo"),
  reference: z.string().trim().max(100).optional().or(z.literal("")),
});

export const createInvoiceSchema = z.object({
  supplierId: z.string().uuid(),
  invoiceNumber: z.string().trim().max(100).optional().or(z.literal("")),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal("")),
  totalInCents: z.coerce.number().int("Total debe ser un número entero de céntimos"),
  taxInCents: z.coerce.number().int().nullable().optional(),
  baseAmountInCents: z.coerce.number().int().nullable().optional(),
  vatRate: z.coerce.number().nonnegative().max(100).nullable().optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  isPaid: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});

const orderItemSchema = z.object({
  productId: z.string().uuid(),
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().int().nonnegative(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export const createOrderSchema = z.object({
  supplierId: z.string().uuid(),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  items: z.array(orderItemSchema).min(1, "Añade al menos un producto"),
});

export type CreateSupplierData = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierData = z.infer<typeof updateSupplierSchema>;
export type CreateProductData = z.infer<typeof createProductSchema>;
export type CreateInvoiceData = z.infer<typeof createInvoiceSchema>;
export type CreateOrderData = z.infer<typeof createOrderSchema>;

export const createBundleSchema = z.object({
  supplierId:  z.string().uuid(),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  bundleDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  pageCount:   z.coerce.number().int().positive().optional(),
});
