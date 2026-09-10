/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";

export interface DishRow {
  id: string; name: string; category: string; isActive: boolean;
  allergens: string | null; usageCount: number; createdAt: string;
}
function mapDish(d: any): DishRow {
  return { id: d.id, name: d.name, category: d.category, isActive: d.isActive,
    allergens: d.allergens ?? null, usageCount: d.usageCount,
    createdAt: (d.createdAt as Date).toISOString() };
}
export async function listDishes(includeInactive = false): Promise<DishRow[]> {
  await requirePermission("menu:read");
  const dishModel = (prisma as unknown as Record<string, unknown>)["dish"] as any;
  const dishes = await dishModel.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ usageCount: "desc" }, { name: "asc" }],
  });
  return (dishes as any[]).map(mapDish);
}
export async function searchDishes(query: string, category?: string): Promise<DishRow[]> {
  await requirePermission("menu:read");
  const dishModel = (prisma as unknown as Record<string, unknown>)["dish"] as any;
  const dishes = await dishModel.findMany({
    where: { isActive: true, ...(category ? { category } : {}), name: { contains: query, mode: "insensitive" } },
    orderBy: [{ usageCount: "desc" }, { name: "asc" }],
    take: 10,
  });
  return (dishes as any[]).map(mapDish);
}
export interface DishState { error?: string; success?: string; dishId?: string; }
export async function createDishAction(_prev: DishState, formData: FormData): Promise<DishState> {
  let actor: { id: string };
  try { actor = await requirePermission("menu:write"); } catch { return { error: "Sin permiso." }; }
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const category = (formData.get("category") as string | null)?.trim() ?? "";
  const allergens = (formData.get("allergens") as string | null)?.trim() || null;
  if (!name || name.length > 200) return { error: "Nombre obligatorio (máx. 200 caracteres)." };
  if (!["FIRST", "SECOND", "OTHER"].includes(category)) return { error: "Categoría no válida." };
  const dishModel = (prisma as unknown as Record<string, unknown>)["dish"] as any;
  const existing = await dishModel.findFirst({ where: { name: { equals: name, mode: "insensitive" }, isActive: true }, select: { id: true } });
  if (existing) return { error: `Ya existe un plato activo con ese nombre: "${name}".` };
  const dish = await dishModel.create({ data: { name, category, allergens, createdById: actor.id, updatedById: actor.id } });
  revalidatePath("/menu/dishes");
  return { success: "Plato creado.", dishId: dish.id };
}
export async function updateDishAction(dishId: string, _prev: DishState, formData: FormData): Promise<DishState> {
  let actor: { id: string };
  try { actor = await requirePermission("menu:write"); } catch { return { error: "Sin permiso." }; }
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const category = (formData.get("category") as string | null)?.trim() ?? "";
  const allergens = (formData.get("allergens") as string | null)?.trim() || null;
  const isActive = formData.get("isActive") !== "false";
  if (!name || name.length > 200) return { error: "Nombre obligatorio (máx. 200 caracteres)." };
  if (!["FIRST", "SECOND", "OTHER"].includes(category)) return { error: "Categoría no válida." };
  const dishModel = (prisma as unknown as Record<string, unknown>)["dish"] as any;
  await dishModel.update({ where: { id: dishId }, data: { name, category, allergens, isActive, updatedById: actor.id } });
  revalidatePath("/menu/dishes");
  return { success: "Plato actualizado." };
}
export async function toggleDishActiveAction(dishId: string, isActive: boolean): Promise<DishState> {
  let actor: { id: string };
  try { actor = await requirePermission("menu:write"); } catch { return { error: "Sin permiso." }; }
  const dishModel = (prisma as unknown as Record<string, unknown>)["dish"] as any;
  await dishModel.update({ where: { id: dishId }, data: { isActive, updatedById: actor.id } });
  revalidatePath("/menu/dishes");
  return { success: isActive ? "Plato activado." : "Plato archivado." };
}
