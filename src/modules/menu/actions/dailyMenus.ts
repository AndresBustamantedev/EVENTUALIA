/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

/**
 * Server Actions — Menú del día (Fase 3)
 *
 * RBAC:
 *  - menu:read         → ADMIN, RRHH, ENCARGADO, COCINA
 *  - menu:write        → ADMIN, RRHH, ENCARGADO
 *  - menu:pdf:generate → ADMIN, RRHH, ENCARGADO
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";
import { parsePriceToCents, toLocalDateString } from "../lib/menuUtils";

// ── Tipos ──────────────────────────────────────────────────────

export interface MenuDishRow {
  id: string;
  dishId: string;
  dishName: string;
  category: string;
  position: number;
}

export interface DailyMenuRow {
  id: string;
  menuDate: string;       // YYYY-MM-DD
  menuTitle: string;      // "MENÚ DEL DÍA" | "MENÚ FIN DE SEMANA" | …
  priceInCents: number;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  dishes: MenuDishRow[];
}

function mapMenuDish(d: any): MenuDishRow {
  return {
    id: d.id,
    dishId: d.dishId,
    dishName: d.dishName,
    category: d.category,
    position: d.position,
  };
}

function mapMenu(m: any): DailyMenuRow {
  return {
    id: m.id,
    menuDate: (m.menuDate as Date).toISOString().split("T")[0],
    menuTitle: m.menuTitle ?? "MENÚ DEL DÍA",
    priceInCents: m.priceInCents,
    status: m.status,
    notes: m.notes ?? null,
    createdAt: (m.createdAt as Date).toISOString(),
    updatedAt: (m.updatedAt as Date).toISOString(),
    dishes: ((m.dishes ?? []) as any[])
      .sort((a: any, b: any) => a.position - b.position)
      .map(mapMenuDish),
  };
}

// ── Listado ────────────────────────────────────────────────────

export interface ListMenusOptions {
  from?: string;   // YYYY-MM-DD
  to?: string;     // YYYY-MM-DD
  status?: string; // "DRAFT" | "ACTIVE"
  limit?: number;
}

export async function listDailyMenus(
  opts: ListMenusOptions = {}
): Promise<DailyMenuRow[]> {
  await requirePermission("menu:read");

  const { from, to, status, limit = 90 } = opts;

  const where: Record<string, unknown> = {};
  if (from || to) {
    where.menuDate = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to)   } : {}),
    };
  }
  if (status) where.status = status;

  const dailyMenuModel = (prisma as unknown as Record<string, unknown>)["dailyMenu"] as any;
  const menus = await dailyMenuModel.findMany({
    where,
    orderBy: { menuDate: "desc" },
    take: limit,
    include: {
      dishes: true,
    },
  });

  return (menus as any[]).map(mapMenu);
}

// ── Obtener un menú ────────────────────────────────────────────

export async function getDailyMenu(
  menuId: string
): Promise<DailyMenuRow | null> {
  await requirePermission("menu:read");

  const dailyMenuModel = (prisma as unknown as Record<string, unknown>)["dailyMenu"] as any;
  const menu = await dailyMenuModel.findUnique({
    where: { id: menuId },
    include: { dishes: true },
  });

  if (!menu) return null;
  return mapMenu(menu);
}

// ── Crear menú ────────────────────────────────────────────────

export interface MenuState {
  error?: string;
  success?: string;
  menuId?: string;
}

export async function createDailyMenuAction(
  _prev: MenuState,
  formData: FormData
): Promise<MenuState> {
  let actor: { id: string };
  try {
    actor = await requirePermission("menu:write");
  } catch {
    return { error: "Sin permiso." };
  }

  const dateRaw  = (formData.get("menuDate")  as string | null)?.trim() ?? "";
  const priceRaw = (formData.get("price")     as string | null)?.trim() ?? "";
  const notes    = (formData.get("notes")     as string | null)?.trim() || null;
  const menuTitle = ((formData.get("menuTitle") as string | null)?.trim() || "MENÚ DEL DÍA").slice(0, 80);

  // Fecha opcional: si no se proporciona se usa la fecha de hoy para cualquier tipo
  // Siempre se normaliza a medianoche UTC para que coincida con el constraint de BD
  let menuDate: Date;
  if (!dateRaw) {
    menuDate = new Date();
  } else {
    menuDate = new Date(dateRaw);
    if (isNaN(menuDate.getTime())) return { error: "Fecha no válida." };
  }
  menuDate.setUTCHours(0, 0, 0, 0);

  const priceInCents = parsePriceToCents(priceRaw);
  if (priceInCents === null || priceInCents < 0) {
    return { error: "Precio no válido. Usa formato 14,50 o 14.50." };
  }
  if (priceInCents > 99999) {
    return { error: "El precio no puede superar 999,99 €." };
  }

  const dailyMenuModel = (prisma as unknown as Record<string, unknown>)["dailyMenu"] as any;

  // Verificar duplicados (ACTIVE o DRAFT) para esa fecha
  const existing = await dailyMenuModel.findFirst({
    where: { menuDate, status: { in: ["ACTIVE", "DRAFT"] } },
    select: { id: true, status: true },
  });
  if (existing) {
    const label = existing.status === "ACTIVE" ? "activo" : "borrador";
    return { error: `Ya existe un menú en ${label} para esa fecha. Edítalo o elige otra fecha.` };
  }

  let menu: any;
  try {
    menu = await dailyMenuModel.create({
      data: {
        menuDate,
        menuTitle,
        priceInCents,
        notes,
        status: "DRAFT",
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
  } catch (err: any) {
    // P2002 = unique constraint violation
    if (err?.code === "P2002") {
      return { error: "Ya existe un menú para esa fecha. Elige otra fecha." };
    }
    throw err;
  }

  revalidatePath("/menu");
  return { success: "Menú creado.", menuId: menu.id };
}

// ── Editar metadatos del menú (precio y título) ───────────────

export async function updateMenuMetaAction(
  menuId: string,
  menuTitle: string,
  priceRaw: string
): Promise<MenuState> {
  let actor: { id: string };
  try {
    actor = await requirePermission("menu:write");
  } catch {
    return { error: "Sin permiso." };
  }

  const title = (menuTitle ?? "").trim().slice(0, 80) || "MENÚ DEL DÍA";
  const priceInCents = parsePriceToCents(priceRaw);
  if (priceInCents === null || priceInCents < 0) {
    return { error: "Precio no válido. Usa formato 14,50 o 14.50." };
  }
  if (priceInCents > 99999) {
    return { error: "El precio no puede superar 999,99 €." };
  }

  const dailyMenuModel = (prisma as unknown as Record<string, unknown>)["dailyMenu"] as any;
  const menu = await dailyMenuModel.findUnique({ where: { id: menuId }, select: { id: true, status: true } });
  if (!menu) return { error: "Menú no encontrado." };
  if (menu.status === "ACTIVE") return { error: "No se puede editar un menú activo. Desactívalo primero." };

  await dailyMenuModel.update({
    where: { id: menuId },
    data: { menuTitle: title, priceInCents, updatedById: actor.id },
  });

  revalidatePath(`/menu/${menuId}`);
  revalidatePath("/menu");
  return { success: "Datos actualizados." };
}

// ── Editar menú ───────────────────────────────────────────────

export async function updateDailyMenuAction(
  menuId: string,
  formData: FormData
): Promise<MenuState> {
  let actor: { id: string };
  try {
    actor = await requirePermission("menu:write");
  } catch {
    return { error: "Sin permiso." };
  }

  const priceRaw = (formData.get("price") as string | null)?.trim() ?? "";
  const notes    = (formData.get("notes") as string | null)?.trim() || null;

  const priceInCents = parsePriceToCents(priceRaw);
  if (priceInCents === null || priceInCents < 0) {
    return { error: "Precio no válido." };
  }
  if (priceInCents > 99999) {
    return { error: "El precio no puede superar 999,99 €." };
  }

  const dailyMenuModel = (prisma as unknown as Record<string, unknown>)["dailyMenu"] as any;
  const menu = await dailyMenuModel.findUnique({
    where: { id: menuId },
    select: { id: true },
  });
  if (!menu) return { error: "Menú no encontrado." };

  await dailyMenuModel.update({
    where: { id: menuId },
    data: { priceInCents, notes, updatedById: actor.id },
  });

  revalidatePath("/menu");
  revalidatePath(`/menu/${menuId}`);
  return { success: "Menú actualizado." };
}

// ── Añadir plato ──────────────────────────────────────────────

export async function addDishToMenuAction(
  menuId: string,
  dishId: string,
  category: string
): Promise<MenuState> {
  let actor: { id: string };
  try {
    actor = await requirePermission("menu:write");
  } catch {
    return { error: "Sin permiso." };
  }

  if (!["FIRST", "SECOND", "OTHER"].includes(category)) {
    return { error: "Categoría no válida." };
  }

  const dailyMenuModel    = (prisma as unknown as Record<string, unknown>)["dailyMenu"]    as any;
  const dailyMenuDishModel = (prisma as unknown as Record<string, unknown>)["dailyMenuDish"] as any;
  const dishModel          = (prisma as unknown as Record<string, unknown>)["dish"]          as any;

  const menu = await dailyMenuModel.findUnique({
    where: { id: menuId },
    select: { id: true, status: true },
  });
  if (!menu) return { error: "Menú no encontrado." };
  if (menu.status === "ACTIVE") {
    return { error: "No se puede editar un menú activo. Desactívalo primero." };
  }

  const dish = await dishModel.findUnique({
    where: { id: dishId },
    select: { id: true, name: true, isActive: true },
  });
  if (!dish || !dish.isActive) return { error: "Plato no disponible." };

  // Verificar duplicado
  const existing = await dailyMenuDishModel.findUnique({
    where: { menuId_dishId: { menuId, dishId } },
    select: { id: true },
  });
  if (existing) return { error: "El plato ya está en el menú." };

  // Posición = último de su categoría + 1
  const lastInCategory = await dailyMenuDishModel.findFirst({
    where: { menuId, category },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (lastInCategory?.position ?? 0) + 1;

  await dailyMenuDishModel.create({
    data: {
      menuId,
      dishId,
      dishName: dish.name,
      category,
      position,
    },
  });

  // Incrementar usageCount del plato
  await dishModel.update({
    where: { id: dishId },
    data: { usageCount: { increment: 1 }, updatedById: actor.id },
  });

  revalidatePath(`/menu/${menuId}`);
  return { success: "Plato añadido." };
}

// ── Añadir plato por nombre (crea en catálogo si no existe) ──

export async function addDishByNameToMenuAction(
  menuId: string,
  name: string,
  category: string
): Promise<MenuState> {
  let actor: { id: string };
  try {
    actor = await requirePermission("menu:write");
  } catch {
    return { error: "Sin permiso." };
  }

  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length < 2) {
    return { error: "El nombre del plato debe tener al menos 2 caracteres." };
  }
  if (trimmedName.length > 200) {
    return { error: "El nombre es demasiado largo (máx. 200 caracteres)." };
  }
  if (!["FIRST", "SECOND", "OTHER"].includes(category)) {
    return { error: "Categoría no válida." };
  }

  const dailyMenuModel     = (prisma as unknown as Record<string, unknown>)["dailyMenu"]     as any;
  const dailyMenuDishModel = (prisma as unknown as Record<string, unknown>)["dailyMenuDish"] as any;
  const dishModel          = (prisma as unknown as Record<string, unknown>)["dish"]           as any;

  const menu = await dailyMenuModel.findUnique({
    where: { id: menuId },
    select: { id: true, status: true },
  });
  if (!menu) return { error: "Menú no encontrado." };
  if (menu.status === "ACTIVE") {
    return { error: "No se puede editar un menú activo. Desactívalo primero." };
  }

  // Buscar plato existente en catálogo (mismo nombre case-insensitive + misma categoría)
  let dish = await dishModel.findFirst({
    where: {
      name: { equals: trimmedName, mode: "insensitive" },
      category,
    },
    select: { id: true, name: true, isActive: true },
  });

  if (!dish) {
    // Crear plato nuevo en el catálogo
    dish = await dishModel.create({
      data: {
        name: trimmedName,
        category,
        isActive: true,
        usageCount: 0,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
  } else if (!dish.isActive) {
    // Reactivar si estaba archivado
    await dishModel.update({
      where: { id: dish.id },
      data: { isActive: true, updatedById: actor.id },
    });
  }

  // Verificar duplicado en el menú
  const existing = await dailyMenuDishModel.findUnique({
    where: { menuId_dishId: { menuId, dishId: dish.id } },
    select: { id: true },
  });
  if (existing) return { error: "El plato ya está en el menú." };

  // Posición = último de su categoría + 1
  const lastInCategory = await dailyMenuDishModel.findFirst({
    where: { menuId, category },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (lastInCategory?.position ?? 0) + 1;

  await dailyMenuDishModel.create({
    data: {
      menuId,
      dishId: dish.id,
      dishName: dish.name,
      category,
      position,
    },
  });

  // Incrementar usageCount
  await dishModel.update({
    where: { id: dish.id },
    data: { usageCount: { increment: 1 }, updatedById: actor.id },
  });

  revalidatePath(`/menu/${menuId}`);
  return { success: "Plato añadido." };
}

// ── Quitar plato ──────────────────────────────────────────────

export async function removeDishFromMenuAction(
  menuId: string,
  menuDishId: string
): Promise<MenuState> {
  try {
    await requirePermission("menu:write");
  } catch {
    return { error: "Sin permiso." };
  }

  const dailyMenuModel     = (prisma as unknown as Record<string, unknown>)["dailyMenu"]    as any;
  const dailyMenuDishModel = (prisma as unknown as Record<string, unknown>)["dailyMenuDish"] as any;

  const menu = await dailyMenuModel.findUnique({
    where: { id: menuId },
    select: { status: true },
  });
  if (!menu) return { error: "Menú no encontrado." };
  if (menu.status === "ACTIVE") {
    return { error: "No se puede editar un menú activo. Desactívalo primero." };
  }

  const menuDish = await dailyMenuDishModel.findUnique({
    where: { id: menuDishId },
    select: { id: true, menuId: true, category: true, position: true },
  });
  if (!menuDish || menuDish.menuId !== menuId) {
    return { error: "Plato no encontrado en el menú." };
  }

  await dailyMenuDishModel.delete({ where: { id: menuDishId } });

  // Renumerar posiciones de la misma categoría
  const remaining = await dailyMenuDishModel.findMany({
    where: { menuId, category: menuDish.category, position: { gt: menuDish.position } },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  for (let i = 0; i < remaining.length; i++) {
    await dailyMenuDishModel.update({
      where: { id: remaining[i].id },
      data: { position: menuDish.position + i },
    });
  }

  revalidatePath(`/menu/${menuId}`);
  return { success: "Plato eliminado del menú." };
}

// ── Reordenar platos (dentro de su categoría) ─────────────────

export async function reorderDishesAction(
  menuId: string,
  orderedMenuDishIds: string[]
): Promise<MenuState> {
  try {
    await requirePermission("menu:write");
  } catch {
    return { error: "Sin permiso." };
  }

  const dailyMenuModel     = (prisma as unknown as Record<string, unknown>)["dailyMenu"]    as any;
  const dailyMenuDishModel = (prisma as unknown as Record<string, unknown>)["dailyMenuDish"] as any;

  const menu = await dailyMenuModel.findUnique({
    where: { id: menuId },
    select: { status: true },
  });
  if (!menu) return { error: "Menú no encontrado." };
  if (menu.status === "ACTIVE") {
    return { error: "No se puede reordenar un menú activo." };
  }

  // Actualizar posiciones en orden
  for (let i = 0; i < orderedMenuDishIds.length; i++) {
    await dailyMenuDishModel.updateMany({
      where: { id: orderedMenuDishIds[i], menuId },
      data: { position: i + 1 },
    });
  }

  revalidatePath(`/menu/${menuId}`);
  return { success: "Orden actualizado." };
}

// ── Publicar menú ─────────────────────────────────────────────

export async function publishMenuAction(menuId: string): Promise<MenuState> {
  let actor: { id: string };
  try {
    actor = await requirePermission("menu:write");
  } catch {
    return { error: "Sin permiso." };
  }

  const dailyMenuModel = (prisma as unknown as Record<string, unknown>)["dailyMenu"] as any;

  const menu = await dailyMenuModel.findUnique({
    where: { id: menuId },
    select: { id: true, status: true, menuDate: true, dishes: true },
  });
  if (!menu) return { error: "Menú no encontrado." };
  if (menu.status === "ACTIVE") return { error: "El menú ya está activo." };

  if (!menu.dishes || (menu.dishes as any[]).length === 0) {
    return { error: "El menú no tiene platos. Añade al menos un plato antes de publicar." };
  }

  // Verificar que no hay otro ACTIVE en esa fecha
  const conflicting = await dailyMenuModel.findFirst({
    where: { menuDate: menu.menuDate, status: "ACTIVE", id: { not: menuId } },
    select: { id: true },
  });
  if (conflicting) {
    return { error: "Ya existe un menú activo para esa fecha. Desactívalo antes de publicar este." };
  }

  await dailyMenuModel.update({
    where: { id: menuId },
    data: { status: "ACTIVE", updatedById: actor.id },
  });

  revalidatePath("/menu");
  revalidatePath(`/menu/${menuId}`);
  return { success: "Menú publicado." };
}

// ── Desactivar menú ───────────────────────────────────────────

export async function unpublishMenuAction(menuId: string): Promise<MenuState> {
  let actor: { id: string };
  try {
    actor = await requirePermission("menu:write");
  } catch {
    return { error: "Sin permiso." };
  }

  const dailyMenuModel = (prisma as unknown as Record<string, unknown>)["dailyMenu"] as any;

  const menu = await dailyMenuModel.findUnique({
    where: { id: menuId },
    select: { id: true, status: true },
  });
  if (!menu) return { error: "Menú no encontrado." };
  if (menu.status === "DRAFT") return { error: "El menú ya está en borrador." };

  await dailyMenuModel.update({
    where: { id: menuId },
    data: { status: "DRAFT", updatedById: actor.id },
  });

  revalidatePath("/menu");
  revalidatePath(`/menu/${menuId}`);
  return { success: "Menú desactivado." };
}

// ── Duplicar menú ─────────────────────────────────────────────

export async function duplicateMenuAction(
  sourceMenuId: string,
  newDateRaw: string
): Promise<MenuState> {
  let actor: { id: string };
  try {
    actor = await requirePermission("menu:write");
  } catch {
    return { error: "Sin permiso." };
  }

  const newDate = new Date(newDateRaw);
  if (isNaN(newDate.getTime())) return { error: "Fecha no válida." };

  const dailyMenuModel     = (prisma as unknown as Record<string, unknown>)["dailyMenu"]    as any;
  const dailyMenuDishModel = (prisma as unknown as Record<string, unknown>)["dailyMenuDish"] as any;

  const source = await dailyMenuModel.findUnique({
    where: { id: sourceMenuId },
    include: { dishes: { orderBy: { position: "asc" } } },
  });
  if (!source) return { error: "Menú de origen no encontrado." };

  // Verificar que no haya ACTIVE en la nueva fecha
  const existingActive = await dailyMenuModel.findFirst({
    where: { menuDate: newDate, status: "ACTIVE" },
    select: { id: true },
  });
  if (existingActive) {
    return {
      error: `Ya existe un menú activo para ${toLocalDateString(newDate)}. Desactívalo antes de duplicar.`,
    };
  }

  // Crear nuevo menú como DRAFT
  const newMenu = await dailyMenuModel.create({
    data: {
      menuDate: newDate,
      priceInCents: source.priceInCents,
      notes: source.notes,
      status: "DRAFT",
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  // Copiar platos (con snapshot de nombre)
  for (const dish of source.dishes as any[]) {
    await dailyMenuDishModel.create({
      data: {
        menuId: newMenu.id,
        dishId: dish.dishId,
        dishName: dish.dishName,
        category: dish.category,
        position: dish.position,
      },
    });
  }

  revalidatePath("/menu");
  return { success: "Menú duplicado.", menuId: newMenu.id };
}

// ── Eliminar menú (solo DRAFT) ────────────────────────────────

export async function deleteMenuAction(menuId: string): Promise<MenuState> {
  try {
    await requirePermission("menu:write");
  } catch {
    return { error: "Sin permiso." };
  }

  const dailyMenuModel     = (prisma as unknown as Record<string, unknown>)["dailyMenu"]    as any;
  const dailyMenuDishModel = (prisma as unknown as Record<string, unknown>)["dailyMenuDish"] as any;
  const menuPdfModel       = (prisma as unknown as Record<string, unknown>)["menuPdf"]       as any;

  const menu = await dailyMenuModel.findUnique({
    where: { id: menuId },
    select: { id: true, status: true },
  });
  if (!menu) return { error: "Menú no encontrado." };
  if (menu.status === "ACTIVE") {
    return { error: "No se puede eliminar un menú activo. Desactívalo primero." };
  }

  // Borrar en orden: PDFs → platos → menú
  await menuPdfModel.deleteMany({ where: { menuId } });
  await dailyMenuDishModel.deleteMany({ where: { menuId } });
  await dailyMenuModel.delete({ where: { id: menuId } });

  revalidatePath("/menu");
  return { success: "Menú eliminado." };
}

// ── Actualizar fecha del menú a hoy ──────────────────────────

export async function updateMenuDateToTodayAction(
  menuId: string
): Promise<MenuState> {
  let actor: { id: string };
  try {
    actor = await requirePermission("menu:write");
  } catch {
    return { error: "Sin permiso." };
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const dailyMenuModel = (prisma as unknown as Record<string, unknown>)["dailyMenu"] as any;

  const menu = await dailyMenuModel.findUnique({
    where: { id: menuId },
    select: { id: true, menuDate: true },
  });
  if (!menu) return { error: "Menú no encontrado." };

  // Comprobar si la fecha ya es hoy
  const menuDateNorm = new Date(menu.menuDate as Date);
  menuDateNorm.setUTCHours(0, 0, 0, 0);
  if (menuDateNorm.getTime() === today.getTime()) {
    return { success: "La fecha ya es hoy." };
  }

  // Comprobar conflicto con otro menú para hoy
  const conflicting = await dailyMenuModel.findFirst({
    where: { menuDate: today, status: { in: ["ACTIVE", "DRAFT"] }, id: { not: menuId } },
    select: { id: true },
  });
  if (conflicting) {
    return { error: "Ya existe un menú para hoy — la fecha no se ha actualizado." };
  }

  await dailyMenuModel.update({
    where: { id: menuId },
    data: { menuDate: today, updatedById: actor.id },
  });

  revalidatePath(`/menu/${menuId}`);
  revalidatePath("/menu");
  return { success: "Fecha actualizada a hoy." };
}
