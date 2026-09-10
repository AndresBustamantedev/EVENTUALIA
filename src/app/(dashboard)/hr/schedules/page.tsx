/**
 * Página: Vista de horarios de todos los empleados activos
 * Acceso: ADMIN, RRHH, ENCARGADO
 * — ENCARGADO ve nombre y horario pero no datos sensibles del empleado.
 */
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { redirect } from "next/navigation";
import { listAllActiveSchedules } from "@/modules/hr/actions/schedules";
import { DAY_NAMES } from "@/modules/hr/types";
import { formatHours, weeklyHoursFromDays } from "@/modules/hr/lib/scheduleUtils";
import Link from "next/link";

export const metadata = { title: "Horarios — Cruz Blanca" };

export default async function SchedulesPage() {
  let actor: { role: string };
  try {
    actor = await requirePermission("hr:schedules:read");
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/");
    throw e;
  }

  const data = await listAllActiveSchedules();

  const canLinkToEmployee =
    actor.role === "ADMIN" || actor.role === "RRHH";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Horarios actuales</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Horarios vigentes de todos los empleados activos
        </p>
      </div>

      {data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          No hay empleados activos.
        </div>
      ) : (
        <div className="space-y-4">
          {data.map(({ employeeId, employeeName, schedule }) => (
            <div key={employeeId} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm">
                  {canLinkToEmployee ? (
                    <Link
                      href={`/hr/${employeeId}?tab=schedule`}
                      className="hover:underline text-primary"
                    >
                      {employeeName}
                    </Link>
                  ) : (
                    employeeName
                  )}
                </div>
                {schedule && (
                  <span className="text-xs text-muted-foreground">
                    Desde {schedule.effectiveFrom} ·{" "}
                    {formatHours(weeklyHoursFromDays(schedule.days))}/sem
                  </span>
                )}
              </div>

              {!schedule ? (
                <p className="text-xs text-muted-foreground">Sin horario vigente</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[480px]">
                    <thead className="text-muted-foreground">
                      <tr>
                        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                          <th key={d} className="text-center py-1 px-2 font-medium">
                            {DAY_NAMES[d].slice(0, 3)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {[1, 2, 3, 4, 5, 6, 7].map((dow) => {
                          const day = schedule.days.find(
                            (d) => d.dayOfWeek === dow
                          );
                          if (!day || day.isRestDay) {
                            return (
                              <td
                                key={dow}
                                className="text-center py-1 px-2 text-muted-foreground"
                              >
                                D
                              </td>
                            );
                          }
                          return (
                            <td key={dow} className="text-center py-1 px-1">
                              {day.morningStart && day.morningEnd && (
                                <div className="text-[11px] text-foreground">
                                  {day.morningStart}–{day.morningEnd}
                                </div>
                              )}
                              {day.afternoonStart && day.afternoonEnd && (
                                <div className="text-[11px] text-muted-foreground">
                                  {day.afternoonStart}–{day.afternoonEnd}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
