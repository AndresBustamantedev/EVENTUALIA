/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

/**
 * Server Actions — Configuración de empresa (app_settings)
 *
 * Solo accesible por ADMIN.
 * Claves usadas: company.name, company.cif, company.address, company.phone
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";

export interface CompanySettings {
  name: string;
  cif: string;
  address: string;
  phone: string;
  email: string;
  signatureName: string;
}

const COMPANY_KEYS = ["company.name", "company.cif", "company.address", "company.phone", "company.email", "company.signatureName"] as const;

/**
 * Lee la configuración de empresa. Solo ADMIN.
 */
export async function getCompanySettings(): Promise<CompanySettings> {
  await requirePermission("system:settings");

  const rows = await (
    (prisma as unknown as Record<string, unknown>)["appSetting"] as any
  ).findMany({
    where: { key: { in: [...COMPANY_KEYS] } },
  });

  const map: Record<string, string> = {};
  for (const row of rows as any[]) {
    map[row.key] = row.value;
  }

  return {
    name: map["company.name"] ?? "",
    cif: map["company.cif"] ?? "",
    address: map["company.address"] ?? "",
    phone: map["company.phone"] ?? "",
    email: map["company.email"] ?? "",
    signatureName: map["company.signatureName"] ?? "",
  };
}

export interface SaveCompanySettingsState {
  error?: string;
  success?: string;
}

/**
 * Guarda la configuración de empresa. Solo ADMIN.
 */
export async function saveCompanySettingsAction(
  _prev: SaveCompanySettingsState,
  formData: FormData
): Promise<SaveCompanySettingsState> {
  let actor: { id: string };
  try {
    actor = await requirePermission("system:settings");
  } catch {
    return { error: "Sin permiso." };
  }

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const cif = (formData.get("cif") as string | null)?.trim() ?? "";
  const address = (formData.get("address") as string | null)?.trim() ?? "";
  const phone = (formData.get("phone") as string | null)?.trim() ?? "";
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const signatureName = (formData.get("signatureName") as string | null)?.trim() ?? "";

  if (!name) return { error: "El nombre de empresa es obligatorio." };

  const entries: { key: string; value: string }[] = [
    { key: "company.name", value: name },
    { key: "company.cif", value: cif },
    { key: "company.address", value: address },
    { key: "company.phone", value: phone },
    { key: "company.email", value: email },
    { key: "company.signatureName", value: signatureName },
  ];

  const appSettingModel = (
    (prisma as unknown as Record<string, unknown>)["appSetting"] as any
  );

  for (const { key, value } of entries) {
    await appSettingModel.upsert({
      where: { key },
      update: { value, updatedById: actor.id },
      create: { key, value, updatedById: actor.id },
    });
  }

  revalidatePath("/admin/settings");
  return { success: "Configuración guardada." };
}
