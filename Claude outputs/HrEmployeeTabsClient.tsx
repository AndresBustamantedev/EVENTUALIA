"use client";

/**
 * Wrapper cliente para las secciones interactivas de la ficha de empleado.
 * Gestiona el estado del modal de edición para contratos y horarios.
 *
 * Ruta sugerida: src/modules/hr/components/HrEmployeeTabsClient.tsx
 *
 * USO en hr/[id]/page.tsx (tab Contratos):
 *   <HrContractsList contracts={contracts} employeeId={employee.id} canWrite={canWrite} />
 *
 * USO en hr/[id]/page.tsx (tab Horario):
 *   <HrSchedulesList schedules={schedules} employeeId={employee.id} canWrite={canWrite} />
 *
 * USO en hr/[id]/page.tsx (tab Jornada):
 *   <HrTimeRecordsList records={records} employeeId={employee.id} canWrite={canWrite} />
 */

import { useState } from "react";
import { ContractEditModal } from "./ContractEditModal";
import { ContractDeleteButton } from "./ContractDeleteButton";
import { ScheduleEditModal } from "./ScheduleEditModal";
import { ScheduleDeleteButton } from "./ScheduleDeleteButton";
import { TimeRecordDeleteButton } from "./TimeRecordDeleteButton";
import { CONTRACT_TYPE_LABELS, DAY_NAMES } from "@/modules/hr/types";
import type { ContractRow, WeeklyScheduleRow } from "@/modules/hr/types";
import type { TimeRecordRow } from "@/modules/hr/actions/timeRecords";
import Link from "next/link";

// ── Contratos ─────────────────────────────────────────────────────────────────

interface ContractsListProps {
  contracts: ContractRow[];
  employeeId: string;
  canWrite: boolean;
}

export function HrContractsList({ contracts, employeeId, canWrite }: ContractsListProps) {
  const [editingContract, setEditingContract] = useState<ContractRow | null>(null);

  return (
    <>
      {editingContract && (
        <ContractEditModal
          contract={editingContract}
          onClose={() => setEditingContract(null)}
          onSuccess={() => setEditingContract(null)}
        />
      )}

      {contracts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay contratos registrados.</p>
      ) : (
        <div className="space-y-3">
          {contracts.map(c => (
            <div key={c.id} className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">
                    {CONTRACT_TYPE_LABELS[c.contractType] ?? c.contractType}
                    {c.isFullTime && (
                      <span className="ml-2 rounded-full px-2 py-0.5 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        Jornada completa
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {c.startDate} → {c.endDate ?? "En vigor"}
                    &nbsp;·&nbsp;{c.weeklyHours} h/sem
                    {c.monthlyHours ? ` · ${c.monthlyHours} h/mes` : ""}
                  </p>
                  {c.notes && (
                    <p className="text-xs text-muted-foreground mt-1 italic">{c.notes}</p>
                  )}
                </div>

                {canWrite && (
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingContract(c)}
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Editar
                    </button>
                    <ContractDeleteButton contractId={c.id} employeeId={employeeId} />
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Registrado por {c.createdByName} el {c.createdAt.split("T")[0]}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Horarios ──────────────────────────────────────────────────────────────────

interface SchedulesListProps {
  schedules: WeeklyScheduleRow[];
  employeeId: string;
  canWrite: boolean;
}

function isVacation(notes: string | null | undefined) {
  return !!notes?.startsWith("VACACIONES");
}

export function HrSchedulesList({ schedules, employeeId, canWrite }: SchedulesListProps) {
  const [editingSchedule, setEditingSchedule] = useState<WeeklyScheduleRow | null>(null);

  return (
    <>
      {editingSchedule && (
        <ScheduleEditModal
          schedule={editingSchedule}
          onClose={() => setEditingSchedule(null)}
          onSuccess={() => setEditingSchedule(null)}
        />
      )}

      {schedules.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay horarios registrados.</p>
      ) : (
        <div className="space-y-4">
          {schedules.map(s => (
            <div key={s.id} className={`rounded-lg border bg-card p-4 space-y-3 ${isVacation(s.notes) ? "border-amber-300 bg-amber-50/30 dark:bg-amber-900/10" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">
                      Desde {s.effectiveFrom}
                      {s.effectiveTo ? ` hasta ${s.effectiveTo}` : " (en vigor)"}
                    </p>
                    {isVacation(s.notes) && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                        🏖 VACACIONES
                      </span>
                    )}
                  </div>
                  {s.notes && !isVacation(s.notes) && (
                    <p className="text-xs text-muted-foreground mt-0.5 italic">{s.notes}</p>
                  )}
                  {isVacation(s.notes) && s.notes!.replace(/^VACACIONES\n?/, "").trim() && (
                    <p className="text-xs text-muted-foreground mt-0.5 italic">
                      {s.notes!.replace(/^VACACIONES\n?/, "").trim()}
                    </p>
                  )}
                </div>

                {canWrite && (
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingSchedule(s)}
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Editar
                    </button>
                    <ScheduleDeleteButton scheduleId={s.id} employeeId={employeeId} />
                  </div>
                )}
              </div>

              {/* Tabla de días — oculta en vacaciones */}
              {!isVacation(s.notes) && s.days.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[380px]">
                    <tbody className="divide-y">
                      {s.days
                        .slice()
                        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                        .map(d => (
                          <tr key={d.dayOfWeek} className={d.isRestDay ? "opacity-40" : ""}>
                            <td className="py-1.5 pr-3 font-medium w-24">{DAY_NAMES[d.dayOfWeek]}</td>
                            <td className="py-1.5 text-muted-foreground">
                              {d.isRestDay
                                ? "Descanso"
                                : [
                                    d.morningStart && d.morningEnd
                                      ? `${d.morningStart}–${d.morningEnd}`
                                      : null,
                                    d.afternoonStart && d.afternoonEnd
                                      ? `${d.afternoonStart}–${d.afternoonEnd}`
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join("  ·  ") || "—"
                              }
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Registrado por {s.createdByName} el {s.createdAt.split("T")[0]}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Jornada (time records) ────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

interface TimeRecordsListProps {
  records: TimeRecordRow[];
  employeeId: string;
  canWrite: boolean;
}

export function HrTimeRecordsList({ records, employeeId, canWrite }: TimeRecordsListProps) {
  return (
    <div className="rounded-lg border overflow-x-auto">
      <table className="w-full text-sm min-w-[520px]">
        <thead className="bg-muted/40 border-b">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-xs text-muted-foreground uppercase tracking-wide">Período</th>
            <th className="px-4 py-3 text-left font-medium text-xs text-muted-foreground uppercase tracking-wide">Estado</th>
            <th className="px-4 py-3 text-right font-medium text-xs text-muted-foreground uppercase tracking-wide">H. ordinarias</th>
            <th className="px-4 py-3 text-right font-medium text-xs text-muted-foreground uppercase tracking-wide">H. extra</th>
            {canWrite && <th className="px-4 py-3 text-right font-medium text-xs text-muted-foreground uppercase tracking-wide">Acciones</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {records.map(r => (
            <tr key={r.id} className="hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3 font-medium">
                <Link
                  href={`/hr/time-records/${r.id}`}
                  className="text-primary hover:underline"
                >
                  {MONTH_NAMES[r.month - 1]} {r.year}
                </Link>
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  r.status === "CLOSED"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                }`}>
                  {r.status === "CLOSED" ? "Cerrado" : "Borrador"}
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {Math.floor(r.totalOrdinaryMinutes / 60)}h {r.totalOrdinaryMinutes % 60}m
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {r.totalOvertimeMinutes > 0
                  ? `${Math.floor(r.totalOvertimeMinutes / 60)}h ${r.totalOvertimeMinutes % 60}m`
                  : "—"}
              </td>
              {canWrite && (
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/hr/time-records/${r.id}`}
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Ver / Editar
                    </Link>
                    <TimeRecordDeleteButton recordId={r.id} status={r.status} />
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
