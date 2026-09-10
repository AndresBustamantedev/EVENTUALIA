/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

/**
 * Server Actions — Documentos de empleados (Fase 2C)
 *
 * RBAC:
 *  - hr:documents:read  → ADMIN, RRHH
 *  - hr:documents:write → ADMIN, RRHH
 *
 * Seguridad:
 *  - Los archivos se guardan con clave opaca (UUID-based), nunca DNI/nombre en ruta.
 *  - MIME real validado por magic bytes antes de almacenar.
 *  - SHA-256 almacenado para integridad y detección de duplicados.
 *  - Borrado lógico: deletedAt + deletedById. Purga solo administrativa.
 *  - La descarga requiere sesión + permiso + pertenencia al empleado (comprobada en route handler).
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/core/db/client";
import { requirePermission } from "@/core/auth/session";
import { auditLog } from "@/core/audit/AuditService";
import { storeFile, deleteFile } from "@/core/storage/StorageProvider";
import {
  validateDocumentBuffer,
  sanitizeFilename,
  sha256Hex,
  DOC_CATEGORY_LABELS,
} from "../lib/documentUtils";

// ── Tipos públicos ────────────────────────────────────────────

export interface EmployeeDocRow {
  id: string;
  employeeId: string;
  storedFileId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  category: string;
  categoryLabel: string;
  title: string;
  docDate: string | null;
  year: number | null;
  month: number | null;
  notes: string | null;
  version: number;
  status: string;
  uploadedByName: string;
  deletedAt: string | null;
  deletedByName: string | null;
  createdAt: string;
}

// ── Helper ────────────────────────────────────────────────────

function mapDoc(d: any): EmployeeDocRow {
  return {
    id: d.id,
    employeeId: d.employeeId,
    storedFileId: d.storedFileId,
    storageKey: d.storedFile.storageKey,
    originalName: d.storedFile.originalName,
    mimeType: d.storedFile.mimeType,
    sizeBytes: d.storedFile.sizeBytes,
    sha256: d.storedFile.sha256,
    category: d.category,
    categoryLabel: DOC_CATEGORY_LABELS[d.category] ?? d.category,
    title: d.title,
    docDate: d.docDate ? (d.docDate as Date).toISOString().split("T")[0] : null,
    year: d.year,
    month: d.month,
    notes: d.notes,
    version: d.version,
    status: d.status,
    uploadedByName: d.uploadedBy?.name ?? "",
    deletedAt: d.deletedAt ? (d.deletedAt as Date).toISOString() : null,
    deletedByName: d.deletedBy?.name ?? null,
    createdAt: (d.createdAt as Date).toISOString(),
  };
}

// ── Listado ───────────────────────────────────────────────────

/**
 * Lista todos los documentos de un empleado (incluidos los borrados si showDeleted=true).
 */
export async function listEmployeeDocuments(
  employeeId: string,
  showDeleted = false
): Promise<EmployeeDocRow[]> {
  await requirePermission("hr:documents:read");

  const docs = await (
    (prisma as unknown as Record<string, unknown>)["employeeDocument"] as any
  ).findMany({
    where: {
      employeeId,
      deletedAt: showDeleted ? undefined : null,
    },
    orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
    include: {
      storedFile: true,
      uploadedBy: { select: { name: true } },
      deletedBy: { select: { name: true } },
    },
  });

  return (docs as any[]).map(mapDoc);
}

// ── Subida ────────────────────────────────────────────────────

export interface UploadDocState {
  error?: string;
  success?: string;
  docId?: string;
}

/**
 * Sube un documento de empleado.
 *
 * FormData esperado:
 *   employeeId, category, title, file (File), docDate?, year?, month?, notes?, status?
 */
export async function uploadEmployeeDocumentAction(
  _prev: UploadDocState,
  formData: FormData
): Promise<UploadDocState> {
  let actor: { id: string };
  try {
    actor = await requirePermission("hr:documents:write");
  } catch {
    return { error: "Sin permiso para subir documentos." };
  }

  const employeeId = (formData.get("employeeId") as string | null)?.trim() ?? "";
  const category   = (formData.get("category")   as string | null)?.trim() ?? "";
  const title      = (formData.get("title")       as string | null)?.trim() ?? "";
  const docDateRaw = (formData.get("docDate")     as string | null)?.trim() ?? "";
  const yearRaw    = (formData.get("year")        as string | null)?.trim() ?? "";
  const monthRaw   = (formData.get("month")       as string | null)?.trim() ?? "";
  const notes      = (formData.get("notes")       as string | null)?.trim() || null;
  const status     = (formData.get("status")      as string | null)?.trim() || "PENDING";
  const file       = formData.get("file");

  if (!employeeId || !category || !title) {
    return { error: "Empleado, categoría y título son obligatorios." };
  }
  if (!title || title.length > 200) {
    return { error: "El título debe tener entre 1 y 200 caracteres." };
  }
  if (!(file instanceof File)) {
    return { error: "Debes seleccionar un archivo." };
  }
  if (file.size === 0) {
    return { error: "El archivo está vacío." };
  }

  // Leer el buffer
  const arrayBuf = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuf);

  // Validar MIME real y tamaño
  const validation = validateDocumentBuffer(buf, file.name);
  if (!validation.ok) return { error: validation.error };

  const mime = validation.detectedMime!;
  const safeName = sanitizeFilename(file.name);
  const hash = sha256Hex(buf);

  // Detectar duplicado exacto para este empleado (mismo hash, no borrado)
  const duplicate = await (
    (prisma as unknown as Record<string, unknown>)["employeeDocument"] as any
  ).findFirst({
    where: {
      employeeId,
      deletedAt: null,
      storedFile: { sha256: hash },
    },
    select: { id: true, title: true },
  });
  if (duplicate) {
    return {
      error: `Ya existe un documento idéntico: "${duplicate.title}". Si es una versión nueva, elimina el anterior primero.`,
    };
  }

  // Calcular versión: cuántos docs activos hay de misma categoría
  const sameCategory = await (
    (prisma as unknown as Record<string, unknown>)["employeeDocument"] as any
  ).count({
    where: { employeeId, category, deletedAt: null },
  });
  const version = (sameCategory as number) + 1;

  // Almacenar archivo
  let stored;
  try {
    stored = await storeFile(
      `hr/employee-docs/${employeeId}`,
      `${Date.now()}_${safeName}`,
      buf
    );
  } catch {
    return { error: "Error al guardar el archivo. Inténtalo de nuevo." };
  }

  // Parsear campos opcionales
  const docDate = docDateRaw ? new Date(docDateRaw) : null;
  const year    = yearRaw  ? parseInt(yearRaw, 10)  : null;
  const month   = monthRaw ? parseInt(monthRaw, 10) : null;

  if (month !== null && (month < 1 || month > 12)) {
    return { error: "El mes debe estar entre 1 y 12." };
  }

  // Crear StoredFile + EmployeeDocument en transacción
  const storedFileModel  = (prisma as unknown as Record<string, unknown>)["storedFile"]  as any;
  const employeeDocModel = (prisma as unknown as Record<string, unknown>)["employeeDocument"] as any;

  let doc: any;
  try {
    const sf = await storedFileModel.create({
      data: {
        storageKey:   stored.storageKey,
        originalName: file.name,
        mimeType:     mime,
        sizeBytes:    buf.length,
        sha256:       hash,
        uploadedById: actor.id,
      },
    });

    doc = await employeeDocModel.create({
      data: {
        employeeId,
        storedFileId: sf.id,
        category,
        title,
        docDate,
        year: year ?? null,
        month: month ?? null,
        notes,
        version,
        status,
        uploadedById: actor.id,
      },
    });
  } catch {
    // Intentar borrar el archivo ya guardado
    await deleteFile(stored.storageKey).catch(() => null);
    return { error: "Error al registrar el documento en la base de datos." };
  }

  await auditLog({
    actorId: actor.id,
    action: "hr.document.upload",
    targetType: "employee_document",
    targetId: doc.id,
    metadata: { employeeId, category, title, sizeBytes: buf.length },
  });

  revalidatePath(`/hr/${employeeId}`);
  return { success: "Documento subido correctamente.", docId: doc.id };
}

// ── Borrado lógico ────────────────────────────────────────────

export interface DeleteDocState {
  error?: string;
  success?: string;
}

export async function softDeleteDocumentAction(
  docId: string
): Promise<DeleteDocState> {
  let actor: { id: string };
  try {
    actor = await requirePermission("hr:documents:write");
  } catch {
    return { error: "Sin permiso." };
  }

  const employeeDocModel = (prisma as unknown as Record<string, unknown>)["employeeDocument"] as any;
  const doc = await employeeDocModel.findUnique({
    where: { id: docId },
    select: { id: true, employeeId: true, deletedAt: true, title: true },
  });

  if (!doc) return { error: "Documento no encontrado." };
  if (doc.deletedAt) return { error: "El documento ya estaba en la papelera." };

  await employeeDocModel.update({
    where: { id: docId },
    data: { deletedAt: new Date(), deletedById: actor.id },
  });

  await auditLog({
    actorId: actor.id,
    action: "hr.document.delete",
    targetType: "employee_document",
    targetId: docId,
    metadata: { employeeId: doc.employeeId, title: doc.title },
  });

  revalidatePath(`/hr/${doc.employeeId}`);
  return { success: "Documento enviado a la papelera." };
}

// ── Restauración ──────────────────────────────────────────────

export async function restoreDocumentAction(
  docId: string
): Promise<DeleteDocState> {
  let actor: { id: string };
  try {
    actor = await requirePermission("hr:documents:write");
  } catch {
    return { error: "Sin permiso." };
  }

  const employeeDocModel = (prisma as unknown as Record<string, unknown>)["employeeDocument"] as any;
  const doc = await employeeDocModel.findUnique({
    where: { id: docId },
    select: { id: true, employeeId: true, deletedAt: true, title: true },
  });

  if (!doc) return { error: "Documento no encontrado." };
  if (!doc.deletedAt) return { error: "El documento no estaba borrado." };

  await employeeDocModel.update({
    where: { id: docId },
    data: { deletedAt: null, deletedById: null },
  });

  await auditLog({
    actorId: actor.id,
    action: "hr.document.restore",
    targetType: "employee_document",
    targetId: docId,
    metadata: { employeeId: doc.employeeId, title: doc.title },
  });

  revalidatePath(`/hr/${doc.employeeId}`);
  return { success: "Documento restaurado." };
}

// ── Actualizar estado (PENDING → SIGNED) ──────────────────────

export async function updateDocumentStatusAction(
  docId: string,
  newStatus: "PENDING" | "SIGNED"
): Promise<DeleteDocState> {
  try {
    await requirePermission("hr:documents:write");
  } catch {
    return { error: "Sin permiso." };
  }

  const employeeDocModel = (prisma as unknown as Record<string, unknown>)["employeeDocument"] as any;
  const doc = await employeeDocModel.findUnique({
    where: { id: docId },
    select: { id: true, employeeId: true, deletedAt: true },
  });

  if (!doc || doc.deletedAt) return { error: "Documento no disponible." };

  await employeeDocModel.update({
    where: { id: docId },
    data: { status: newStatus },
  });

  revalidatePath(`/hr/${doc.employeeId}`);
  return { success: "Estado actualizado." };
}
