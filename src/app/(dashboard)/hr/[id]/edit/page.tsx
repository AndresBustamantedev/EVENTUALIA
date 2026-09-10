/**
 * Página: Editar empleado
 * Acceso: ADMIN, RRHH
 */
"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EmployeeForm } from "@/modules/hr/components/EmployeeForm";
import {
  getEmployee,
  updateEmployeeAction,
} from "@/modules/hr/actions/employees";
import type { EmployeeRow } from "@/modules/hr/types";
import type { UpdateEmployeeState } from "@/modules/hr/actions/employees";

export default function EditEmployeePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEmployee(params.id)
      .then(setEmployee)
      .catch(() => router.push("/hr"))
      .finally(() => setLoading(false));
  }, [params.id, router]);

  async function handleAction(
    prev: UpdateEmployeeState,
    formData: FormData
  ): Promise<UpdateEmployeeState> {
    const result = await updateEmployeeAction(prev, formData);
    if (result.success) {
      router.push(`/hr/${params.id}`);
    }
    return result;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Cargando…
      </div>
    );
  }

  if (!employee) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Editar — {employee.fullName}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Los campos de DNI/NIE, NAF, teléfono y dirección se cifran automáticamente.
        </p>
      </div>

      <div className="bg-card rounded-xl border p-6">
        <EmployeeForm mode="edit" employee={employee} action={handleAction} />
      </div>
    </div>
  );
}
