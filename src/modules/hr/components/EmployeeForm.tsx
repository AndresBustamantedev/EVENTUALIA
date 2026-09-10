"use client";

import { useActionState, useState } from "react";
import type {
  CreateEmployeeState,
  UpdateEmployeeState,
} from "../actions/employees";
import type { EmployeeRow, EmployeeStatus } from "../types";
import { EMPLOYEE_STATUS_LABELS } from "../types";

interface EmployeeFormProps {
  mode: "create" | "edit";
  employee?: EmployeeRow;
  action: (
    prev: CreateEmployeeState | UpdateEmployeeState,
    formData: FormData
  ) => Promise<CreateEmployeeState | UpdateEmployeeState>;
}

const initialState: CreateEmployeeState = {};

const INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";
const LABEL_CLASS = "block text-sm font-medium mb-1";
const ERROR_CLASS = "mt-1 text-xs text-destructive";
const SECTION_CLASS = "border-t pt-6 mt-6";

export function EmployeeForm({
  mode,
  employee,
  action,
}: EmployeeFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  const fe = (state as CreateEmployeeState).fieldErrors ?? {};

  const fieldError = (field: string) =>
    fe[field]?.[0] ? <p className={ERROR_CLASS}>{fe[field][0]}</p> : null;

  const [selectedStatus, setSelectedStatus] = useState<string>(employee?.status ?? "ACTIVE");

  const isEdit = mode === "edit";

  return (
    <form action={formAction} className="space-y-6">
      {isEdit && employee && (
        <input type="hidden" name="id" value={employee.id} />
      )}

      {/* Estado global */}
      {(state as CreateEmployeeState).error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {(state as CreateEmployeeState).error}
        </div>
      )}

      {/* Datos personales */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Datos personales
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className={LABEL_CLASS}>
              Nombre <span className="text-destructive">*</span>
            </label>
            <input
              id="firstName"
              name="firstName"
              defaultValue={employee?.firstName}
              required
              disabled={isPending}
              className={INPUT_CLASS}
            />
            {fieldError("firstName")}
          </div>

          <div>
            <label htmlFor="lastName" className={LABEL_CLASS}>
              Apellidos <span className="text-destructive">*</span>
            </label>
            <input
              id="lastName"
              name="lastName"
              defaultValue={employee?.lastName}
              required
              disabled={isPending}
              className={INPUT_CLASS}
            />
            {fieldError("lastName")}
          </div>

          <div>
            <label htmlFor="email" className={LABEL_CLASS}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={employee?.email ?? ""}
              disabled={isPending}
              className={INPUT_CLASS}
            />
            {fieldError("email")}
          </div>

          <div>
            <label htmlFor="hireDate" className={LABEL_CLASS}>
              Fecha de alta <span className="text-destructive">*</span>
            </label>
            <input
              id="hireDate"
              name="hireDate"
              type="date"
              defaultValue={employee?.hireDate}
              required
              disabled={isPending}
              className={INPUT_CLASS}
            />
            {fieldError("hireDate")}
          </div>

          <div>
            <label htmlFor="status" className={LABEL_CLASS}>
              Estado <span className="text-destructive">*</span>
            </label>
            <select
              id="status"
              name="status"
              defaultValue={employee?.status ?? "ACTIVE"}
              onChange={(e) => setSelectedStatus(e.target.value)}
              disabled={isPending}
              className={INPUT_CLASS}
            >
              {(["ACTIVE", "INACTIVE", "TERMINATED"] as EmployeeStatus[]).map(
                (s) => (
                  <option key={s} value={s}>
                    {EMPLOYEE_STATUS_LABELS[s]}
                  </option>
                )
              )}
            </select>
            {fieldError("status")}
          </div>

          {selectedStatus === "TERMINATED" && (
            <div>
              <label htmlFor="terminationDate" className={LABEL_CLASS}>
                Fecha de baja
              </label>
              <input
                id="terminationDate"
                name="terminationDate"
                type="date"
                defaultValue={employee?.terminationDate ?? ""}
                disabled={isPending}
                className={INPUT_CLASS}
              />
              {fieldError("terminationDate")}
              <p className="mt-1 text-xs text-muted-foreground">
                Opcional. Para adjuntar el finiquito, usa la pestaña «Documentos» (categoría Finiquito).
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Datos sensibles — solo RRHH/ADMIN los ven */}
      <section className={SECTION_CLASS}>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Datos identificativos{" "}
          <span className="text-xs font-normal normal-case">
            (cifrados en base de datos)
          </span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="dni" className={LABEL_CLASS}>
              DNI / NIE
            </label>
            <input
              id="dni"
              name="dni"
              defaultValue={employee?.dni ?? ""}
              placeholder="12345678A"
              disabled={isPending}
              autoComplete="off"
              className={INPUT_CLASS}
            />
            {fieldError("dni")}
          </div>

          <div>
            <label htmlFor="naf" className={LABEL_CLASS}>
              Nº Afiliación SS (NAF)
            </label>
            <input
              id="naf"
              name="naf"
              defaultValue={employee?.naf ?? ""}
              placeholder="281234567890"
              disabled={isPending}
              autoComplete="off"
              className={INPUT_CLASS}
            />
            {fieldError("naf")}
          </div>

          <div>
            <label htmlFor="phone" className={LABEL_CLASS}>
              Teléfono
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={employee?.phone ?? ""}
              placeholder="600 000 000"
              disabled={isPending}
              autoComplete="off"
              className={INPUT_CLASS}
            />
            {fieldError("phone")}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="address" className={LABEL_CLASS}>
              Dirección
            </label>
            <input
              id="address"
              name="address"
              defaultValue={employee?.address ?? ""}
              disabled={isPending}
              className={INPUT_CLASS}
            />
            {fieldError("address")}
          </div>
        </div>
      </section>

      {/* Contacto de emergencia */}
      <section className={SECTION_CLASS}>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Contacto de emergencia
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="emergencyContactName" className={LABEL_CLASS}>
              Nombre
            </label>
            <input
              id="emergencyContactName"
              name="emergencyContactName"
              defaultValue={employee?.emergencyContactName ?? ""}
              disabled={isPending}
              className={INPUT_CLASS}
            />
            {fieldError("emergencyContactName")}
          </div>

          <div>
            <label htmlFor="emergencyContactPhone" className={LABEL_CLASS}>
              Teléfono
            </label>
            <input
              id="emergencyContactPhone"
              name="emergencyContactPhone"
              type="tel"
              defaultValue={employee?.emergencyContactPhone ?? ""}
              placeholder="600 000 000"
              disabled={isPending}
              autoComplete="off"
              className={INPUT_CLASS}
            />
            {fieldError("emergencyContactPhone")}
          </div>
        </div>
      </section>

      {/* Notas */}
      <section className={SECTION_CLASS}>
        <label htmlFor="notes" className={LABEL_CLASS}>
          Notas internas
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={employee?.notes ?? ""}
          disabled={isPending}
          className={INPUT_CLASS}
        />
        {fieldError("notes")}
      </section>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {isPending
            ? "Guardando…"
            : isEdit
              ? "Guardar cambios"
              : "Crear empleado"}
        </button>
      </div>
    </form>
  );
}
