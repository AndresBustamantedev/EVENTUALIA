/* eslint-disable @typescript-eslint/no-explicit-any */
// ── AÑADIR AL FINAL DE src/modules/hr/actions/timeRecords.ts ─────────────────

// ── Eliminar registro de jornada ──────────────────────────────────────────────
// Sólo se permite eliminar registros en estado DRAFT.
// Un registro CLOSED debe reabrirse antes de poder eliminarse.

export async function deleteTimeRecordAction(
  recordId: string
): Promise<{ error?: string; success?: boolean }> {
  try {
    await requirePermission("hr:records:write");
  } catch {
    return { error: "No tienes permiso para eliminar registros de jornada." };
  }

  if (!recordId) return { error: "ID de registro no válido." };

  const record = await ((prisma as unknown as Record<string, unknown>)["timeRecord"] as any).findUnique({
    where: { id: recordId },
    select: { id: true, status: true, employeeId: true, year: true, month: true },
  });

  if (!record) return { error: "Registro no encontrado." };
  if (record.status === "CLOSED") {
    return { error: "El registro está cerrado. Reabrirlo antes de eliminarlo." };
  }

  try {
    // Los días y PDFs se eliminan en cascada si está configurado en Prisma.
    // Si no, elimina manualmente:
    await ((prisma as unknown as Record<string, unknown>)["timeRecordDay"] as any).deleteMany({
      where: { timeRecordId: recordId },
    });
    await ((prisma as unknown as Record<string, unknown>)["timeRecordPdf"] as any).deleteMany({
      where: { timeRecordId: recordId },
    });
    await ((prisma as unknown as Record<string, unknown>)["timeRecord"] as any).delete({
      where: { id: recordId },
    });

    revalidatePath(`/hr/${record.employeeId}`);
    return { success: true };
  } catch (err) {
    console.error("[deleteTimeRecord]", err);
    return { error: "Error al eliminar el registro. Inténtalo de nuevo." };
  }
}
