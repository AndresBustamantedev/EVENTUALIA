/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";

// ── Types ─────────────────────────────────────────────────────

export interface QuarterStatusRow {
  id:                  string | null; // null = no existe todavía en DB
  supplierId:          string;
  year:                number;
  quarter:             number;
  mayorRequested:      boolean;
  mayorRequestedAt:    string | null;
  mayorReceived:       boolean;
  mayorReceivedAt:     string | null;
  reconciled:          boolean;
  reconciledAt:        string | null;
  sentToAccountant:    boolean;
  sentToAccountantAt:  string | null;
  closed:              boolean;
  closedAt:            string | null;
  notes:               string | null;
  // derived: mayor subido vía SupplierMayor
  mayorFileUploaded:   boolean;
}

function mapStatus(s: any): QuarterStatusRow {
  return {
    id:                 s.id,
    supplierId:         s.supplierId,
    year:               s.year,
    quarter:            s.quarter,
    mayorRequested:     s.mayorRequested,
    mayorRequestedAt:   s.mayorRequestedAt ? (s.mayorRequestedAt as Date).toISOString() : null,
    mayorReceived:      s.mayorReceived,
    mayorReceivedAt:    s.mayorReceivedAt  ? (s.mayorReceivedAt  as Date).toISOString() : null,
    reconciled:         s.reconciled,
    reconciledAt:       s.reconciledAt     ? (s.reconciledAt     as Date).toISOString() : null,
    sentToAccountant:   s.sentToAccountant,
    sentToAccountantAt: s.sentToAccountantAt ? (s.sentToAccountantAt as Date).toISOString() : null,
    closed:             s.closed,
    closedAt:           s.closedAt         ? (s.closedAt         as Date).toISOString() : null,
    notes:              s.notes ?? null,
    mayorFileUploaded:  false, // se enriquece después
  };
}

// ── List all quarter statuses for a supplier ──────────────────

export async function listQuarterStatuses(supplierId: string): Promise<QuarterStatusRow[]> {
  await requirePermission("suppliers:read");

  const [statuses, mayors] = await Promise.all([
    (prisma as any).supplierQuarterStatus.findMany({
      where: { supplierId },
      orderBy: [{ year: "desc" }, { quarter: "desc" }],
    }),
    (prisma as any).supplierMayor.findMany({
      where: { supplierId },
      select: { year: true, quarter: true },
    }),
  ]);

  const mayorSet = new Set<string>(
    (mayors as any[]).map((m: any) => `${m.year}-${m.quarter}`)
  );

  return (statuses as any[]).map((s: any) => ({
    ...mapStatus(s),
    mayorFileUploaded: mayorSet.has(`${s.year}-${s.quarter}`),
  }));
}

// ── Upsert (toggle) a boolean field ──────────────────────────

type BoolField =
  | "mayorRequested"
  | "mayorReceived"
  | "reconciled"
  | "sentToAccountant"
  | "closed";

const TIMESTAMP_MAP: Record<BoolField, string> = {
  mayorRequested:   "mayorRequestedAt",
  mayorReceived:    "mayorReceivedAt",
  reconciled:       "reconciledAt",
  sentToAccountant: "sentToAccountantAt",
  closed:           "closedAt",
};

export async function toggleQuarterStatusAction(
  supplierId: string,
  year: number,
  quarter: number,
  field: BoolField,
  value: boolean
): Promise<{ error?: string; success?: boolean }> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  const tsField = TIMESTAMP_MAP[field];
  const data: Record<string, any> = {
    [field]:   value,
    [tsField]: value ? new Date() : null,
    updatedById: actor.id,
  };

  await (prisma as any).supplierQuarterStatus.upsert({
    where: { supplierId_year_quarter: { supplierId, year, quarter } },
    create: {
      supplierId,
      year,
      quarter,
      updatedById: actor.id,
      ...data,
    },
    update: data,
  });

  revalidatePath(`/suppliers/${supplierId}`);
  return { success: true };
}

// ── Update notes ──────────────────────────────────────────────

export async function updateQuarterNotesAction(
  supplierId: string,
  year: number,
  quarter: number,
  notes: string
): Promise<{ error?: string; success?: boolean }> {
  let actor: any;
  try { actor = await requirePermission("suppliers:write"); }
  catch { return { error: "Sin permiso." }; }

  await (prisma as any).supplierQuarterStatus.upsert({
    where: { supplierId_year_quarter: { supplierId, year, quarter } },
    create: { supplierId, year, quarter, notes, updatedById: actor.id },
    update: { notes, updatedById: actor.id },
  });

  revalidatePath(`/suppliers/${supplierId}`);
  return { success: true };
}
