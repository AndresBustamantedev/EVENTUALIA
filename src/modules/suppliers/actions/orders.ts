/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";
import { createOrderSchema } from "../lib/validators";
import type { OrderRow, OrderFormState, OrderStatus } from "../types";

function mapOrder(o: any): OrderRow {
  return {
    id: o.id,
    supplierId: o.supplierId,
    supplierName: o.supplier?.name ?? "",
    orderDate: (o.orderDate as Date).toISOString().split("T")[0],
    expectedDate: o.expectedDate ? (o.expectedDate as Date).toISOString().split("T")[0] : null,
    receivedAt: o.receivedAt ? (o.receivedAt as Date).toISOString() : null,
    status: o.status as OrderStatus,
    notes: o.notes,
    items: (o.items ?? []).map((item: any) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product?.name ?? item.description,
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: item.unitPrice,
    })),
    createdAt: (o.createdAt as Date).toISOString(),
  };
}

export async function listOrders(supplierId?: string): Promise<OrderRow[]> {
  await requirePermission("suppliers:read");
  const rows = await (prisma as any).order.findMany({
    where: supplierId ? { supplierId } : undefined,
    include: {
      supplier: { select: { name: true } },
      items: { include: { product: { select: { name: true } } }, orderBy: { id: "asc" } },
    },
    orderBy: { orderDate: "desc" },
  });
  return (rows as any[]).map(mapOrder);
}

export async function createOrderAction(
  _prev: OrderFormState,
  formData: FormData
): Promise<OrderFormState> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso para crear pedidos." }; }

  // Items come as JSON string in formData
  let itemsRaw: unknown[] = [];
  try {
    const itemsStr = formData.get("items") as string;
    itemsRaw = JSON.parse(itemsStr);
  } catch {
    return { error: "Error al procesar los productos del pedido." };
  }

  const raw = {
    supplierId: formData.get("supplierId") as string,
    orderDate: formData.get("orderDate") as string,
    expectedDate: (formData.get("expectedDate") as string) || null,
    notes: (formData.get("notes") as string) || undefined,
    items: itemsRaw,
  };

  const parsed = createOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }
  const d = parsed.data;

  const order = await (prisma as any).order.create({
    data: {
      supplierId: d.supplierId,
      orderDate: new Date(d.orderDate),
      expectedDate: d.expectedDate && d.expectedDate !== "" ? new Date(d.expectedDate) : null,
      notes: d.notes || null,
      createdById: actor.id,
      items: {
        create: d.items.map((item) => ({
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          notes: item.notes || null,
        })),
      },
    },
  });

  revalidatePath(`/suppliers/${d.supplierId}`);
  return { success: true, orderId: order.id };
}

export async function updateOrderStatusAction(
  orderId: string,
  status: OrderStatus
): Promise<{ error?: string; success?: boolean }> {
  try { await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const order = await (prisma as any).order.findUnique({
    where: { id: orderId },
    select: { supplierId: true },
  });
  if (!order) return { error: "Pedido no encontrado." };

  await (prisma as any).order.update({
    where: { id: orderId },
    data: {
      status,
      receivedAt: status === "RECEIVED" ? new Date() : undefined,
    },
  });

  revalidatePath(`/suppliers/${order.supplierId}`);
  return { success: true };
}
