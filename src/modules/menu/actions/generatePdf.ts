/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

/**
 * Server Action — Generar PDF del menú del día (Fase 3)
 *
 * RBAC: menu:pdf:generate → ADMIN, RRHH, ENCARGADO
 */

import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";
import { storeFile } from "@/core/storage/StorageProvider";
import { generateMenuPdfBuffer, type MenuPdfData, type MenuPdfDish } from "@/core/pdf/menuPdf";
import { formatPrice, formatMenuDate, formatMenuDateShort } from "../lib/menuUtils";
import { revalidatePath } from "next/cache";

export interface GeneratePdfState {
  error?: string;
  success?: string;
  pdfId?: string;
  storageKey?: string;
}

export async function generateMenuPdfAction(
  menuId: string
): Promise<GeneratePdfState> {
  let actor: { id: string };
  try {
    actor = await requirePermission("menu:pdf:generate");
  } catch {
    return { error: "Sin permiso para generar PDFs." };
  }

  const dailyMenuModel = (prisma as unknown as Record<string, unknown>)["dailyMenu"] as any;
  const menuPdfModel   = (prisma as unknown as Record<string, unknown>)["menuPdf"]   as any;

  const menu = await dailyMenuModel.findUnique({
    where: { id: menuId },
    include: {
      dishes: { orderBy: [{ category: "asc" }, { position: "asc" }] },
    },
  });

  if (!menu) return { error: "Menú no encontrado." };

  const dishes = menu.dishes as any[];

  const firstCourses:  MenuPdfDish[] = dishes.filter((d: any) => d.category === "FIRST" ).map((d: any) => ({ name: d.dishName as string, allergens: null as string | null }));
  const secondCourses: MenuPdfDish[] = dishes.filter((d: any) => d.category === "SECOND").map((d: any) => ({ name: d.dishName as string, allergens: null as string | null }));
  const otherDishes:   MenuPdfDish[] = dishes.filter((d: any) => d.category === "OTHER" ).map((d: any) => ({ name: d.dishName as string, allergens: null as string | null }));

  if (firstCourses.length === 0 && secondCourses.length === 0) {
    return { error: "El menú no tiene platos. Añade platos antes de generar el PDF." };
  }

  // Enriquecer con alérgenos del catálogo de platos
  const dishModel = (prisma as unknown as Record<string, unknown>)["dish"] as any;
  const allDishIds = dishes.map((d: any) => d.dishId);
  const catalogDishes = await dishModel.findMany({
    where: { id: { in: allDishIds } },
    select: { id: true, allergens: true },
  });
  const allergensMap: Record<string, string | null> = {};
  for (const cd of catalogDishes as any[]) {
    allergensMap[cd.id] = cd.allergens ?? null;
  }

  // Asignar alérgenos
  for (const dish of dishes) {
    if (dish.category === "FIRST")  firstCourses [firstCourses .findIndex(d => d.name === dish.dishName)].allergens = allergensMap[dish.dishId] ?? null;
    if (dish.category === "SECOND") secondCourses[secondCourses.findIndex(d => d.name === dish.dishName)].allergens = allergensMap[dish.dishId] ?? null;
    if (dish.category === "OTHER")  otherDishes  [otherDishes  .findIndex(d => d.name === dish.dishName)].allergens = allergensMap[dish.dishId] ?? null;
  }

  const pdfData: MenuPdfData = {
    menuDate:      formatMenuDateShort(menu.menuDate as Date),
    menuDateLong:  formatMenuDate(menu.menuDate as Date),
    priceFormatted: formatPrice(menu.priceInCents as number),
    menuTitle:     (menu.menuTitle as string | undefined) ?? "MENÚ DEL DÍA",
    firstCourses,
    secondCourses,
    otherDishes,
  };

  // Generar PDF
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateMenuPdfBuffer(pdfData);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generateMenuPdfAction] PDF render failed:", err);
    return { error: `PDF error: ${msg}` };
  }

  // Marcar PDFs anteriores como no actuales
  await menuPdfModel.updateMany({
    where: { menuId, isCurrent: true },
    data: { isCurrent: false },
  });

  // Guardar archivo
  const filename = `menu_${menuId}_${Date.now()}.pdf`;
  let stored: { storageKey: string };
  try {
    stored = await storeFile(`menu/pdfs/${menuId}`, filename, pdfBuffer);
  } catch {
    return { error: "Error al guardar el PDF." };
  }

  // Registrar en BD
  const pdf = await menuPdfModel.create({
    data: {
      menuId,
      storageKey: stored.storageKey,
      sizeBytes: pdfBuffer.length,
      isCurrent: true,
      generatedById: actor.id,
    },
  });

  revalidatePath(`/menu/${menuId}`);
  return { success: "PDF generado correctamente.", pdfId: pdf.id, storageKey: stored.storageKey };
}
