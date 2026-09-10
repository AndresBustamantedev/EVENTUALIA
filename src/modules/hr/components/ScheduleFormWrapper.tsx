"use client";

import { ScheduleForm } from "./ScheduleForm";
import { createScheduleAction } from "../actions/schedules";

export function ScheduleFormWrapper({ employeeId }: { employeeId: string }) {
  return <ScheduleForm employeeId={employeeId} action={createScheduleAction} />;
}
