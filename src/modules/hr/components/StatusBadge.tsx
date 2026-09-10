import type { EmployeeStatus } from "../types";
import { EMPLOYEE_STATUS_LABELS } from "../types";

interface StatusBadgeProps {
  status: EmployeeStatus;
}

const STATUS_STYLES: Record<EmployeeStatus, string> = {
  ACTIVE:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  INACTIVE:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  TERMINATED:
    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {EMPLOYEE_STATUS_LABELS[status]}
    </span>
  );
}
