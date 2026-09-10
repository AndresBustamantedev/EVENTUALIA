/**
 * Página: Crear nuevo empleado
 * Acceso: ADMIN, RRHH
 */
"use client";

import { useRouter } from "next/navigation";
import { EmployeeForm } from "@/modules/hr/components/EmployeeForm";
import { createEmployeeAction } from "@/modules/hr/actions/employees";
import type { CreateEmployeeState } from "@/modules/hr/actions/employees";

export default function NewEmployeePage() {
  const router = useRouter();

  async function handleAction(
    prev: CreateEmployeeState,
    formData: FormData
  ): Promise<CreateEmployeeState> {
    const result = await createEmployeeAction(prev, formData);
    if (result.success && result.employeeId) {
      router.push(`/hr/${result.employeeId}`);
    }
    return result;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nuevo empleado</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Los campos de DNI/NIE, NAF, teléfono y dirección se cifran automáticamente.
        </p>
      </div>

      <div className="bg-card rounded-xl border p-6">
        <EmployeeForm
          mode="create"
          action={handleAction}
        />
      </div>
    </div>
  );
}
