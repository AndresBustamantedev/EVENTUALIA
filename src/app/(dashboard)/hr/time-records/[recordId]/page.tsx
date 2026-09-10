/**
 * Página: Registro mensual de jornada — edición y cierre
 * Acceso: ADMIN, RRHH (hr:records:read / hr:records:write)
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { getTimeRecord } from "@/modules/hr/actions/timeRecords";
import { formatMonthYear } from "@/modules/hr/lib/timeRecordUtils";
import { DayEditorWrapper } from "@/modules/hr/components/DayEditorWrapper";
import { CloseRecordButton } from "@/modules/hr/components/CloseRecordButton";
import { ReopenRecordButton } from "@/modules/hr/components/ReopenRecordButton";
import { GeneratePdfButton } from "@/modules/hr/components/GeneratePdfButton";

interface PageProps {
  params: Promise<{ recordId: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { recordId } = await params;
  try {
    const r = await getTimeRecord(recordId);
    return {
      title: `Jornada ${formatMonthYear(r.year, r.month)} — Cruz Blanca`,
    };
  } catch {
    return { title: "Registro de jornada — Cruz Blanca" };
  }
}

export default async function TimeRecordDetailPage({ params }: PageProps) {
  const { recordId } = await params;

  let actor: { role: string };
  try {
    actor = await requirePermission("hr:records:read");
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/");
    throw e;
  }

  const canWrite = actor.role === "ADMIN" || actor.role === "RRHH";

  let record;
  try {
    record = await getTimeRecord(recordId);
  } catch {
    notFound();
  }

  const isDraft = record.status === "DRAFT";
  const totalOrdH = Math.floor(record.totalOrdinaryMinutes / 60);
  const totalOrdM = record.totalOrdinaryMinutes % 60;
  const totalOvtH = Math.floor(record.totalOvertimeMinutes / 60);
  const totalOvtM = record.totalOvertimeMinutes % 60;

  const contractSnap = record.contractSnapshot as Record<string, unknown>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Cabecera */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Link
              href={`/hr/${record.employeeId}?tab=jornada`}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Volver
            </Link>
            <h1 className="text-xl font-semibold">
              Jornada {formatMonthYear(record.year, record.month)}
            </h1>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                isDraft
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-green-100 text-green-800"
              }`}
            >
              {isDraft ? "Borrador" : "Cerrado"}
            </span>
          </div>
          {contractSnap.contractType ? (
            <p className="text-sm text-muted-foreground">
              {String(contractSnap.contractType)}
              {contractSnap.weeklyHours
                ? ` · ${String(contractSnap.weeklyHours)}h/sem`
                : ""}
            </p>
          ) : null}
        </div>

        {/* Acciones */}
        {canWrite && (
          <div className="flex gap-2 items-center">
            {record.currentPdfKey && (
              <a
                href={`/api/files/time-records/${encodeURIComponent(record.currentPdfKey)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                Ver PDF
              </a>
            )}
            <GeneratePdfButton recordId={recordId} />
            {isDraft ? (
              <CloseRecordButton recordId={recordId} />
            ) : (
              <ReopenRecordButton recordId={recordId} />
            )}
          </div>
        )}
      </div>

      {/* Resumen */}
      {!isDraft && (
        <div className="rounded-lg border p-4 bg-muted/30 text-sm grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryItem
            label="Horas ordinarias"
            value={`${totalOrdH}h ${totalOrdM > 0 ? `${totalOrdM}m` : ""}`.trim()}
          />
          <SummaryItem
            label="Horas extraordinarias"
            value={`${totalOvtH}h ${totalOvtM > 0 ? `${totalOvtM}m` : ""}`.trim()}
          />
          {record.closedAt && (
            <SummaryItem
              label="Cerrado el"
              value={new Date(record.closedAt).toLocaleDateString("es-ES")}
            />
          )}
          {record.reopenReason && (
            <SummaryItem label="Motivo reapertura" value={record.reopenReason} />
          )}
        </div>
      )}

      {/* Tabla de días */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-muted/50 text-muted-foreground text-xs">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-[7%]">Fecha</th>
              <th className="text-left px-3 py-2 font-medium w-[5%]">D</th>
              <th className="text-left px-3 py-2 font-medium w-[12%]">Tipo</th>
              <th className="text-left px-3 py-2 font-medium w-[16%]">Mañana</th>
              <th className="text-left px-3 py-2 font-medium w-[16%]">Tarde/Noche</th>
              <th className="text-right px-3 py-2 font-medium w-[9%]">Total</th>
              <th className="text-right px-3 py-2 font-medium w-[9%]">Ordin.</th>
              <th className="text-right px-3 py-2 font-medium w-[9%]">Extras</th>
              <th className="text-left px-3 py-2 font-medium">Obs.</th>
              {isDraft && canWrite && (
                <th className="w-[60px]"></th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {record.days.map((day) => (
              <DayEditorWrapper
                key={day.id}
                day={day}
                recordId={recordId}
                isDraft={isDraft && canWrite}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Totales */}
      <div className="flex justify-end gap-8 text-sm border-t pt-4">
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Horas ordinarias</p>
          <p className="font-semibold tabular-nums">
            {totalOrdH}h {totalOrdM > 0 ? `${totalOrdM}m` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Horas extraordinarias</p>
          <p className="font-semibold tabular-nums">
            {totalOvtH}h {totalOvtM > 0 ? `${totalOvtM}m` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}
