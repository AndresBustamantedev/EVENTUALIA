/**
 * Página: Configuración de empresa
 * Acceso: solo ADMIN
 */
"use client";

import { useActionState, useEffect, useState } from "react";
import {
  getCompanySettings,
  saveCompanySettingsAction,
} from "@/modules/hr/actions/appSettings";
import type { CompanySettings } from "@/modules/hr/actions/appSettings";

const INITIAL_STATE = { error: undefined, success: undefined };

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [state, formAction, isPending] = useActionState(
    saveCompanySettingsAction,
    INITIAL_STATE
  );

  useEffect(() => {
    getCompanySettings()
      .then(setSettings)
      .catch(() => setLoadError("Sin permiso o error al cargar la configuración."));
  }, []);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-xl font-semibold">Configuración de empresa</h1>

      {loadError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </p>
      )}

      {settings !== null && (
        <form action={formAction} className="space-y-4">
          <Field
            id="name"
            label="Nombre de empresa"
            defaultValue={settings.name}
            required
          />
          <Field
            id="cif"
            label="CIF"
            defaultValue={settings.cif}
          />
          <Field
            id="signatureName"
            label="Nombre empresa en firma"
            defaultValue={settings.signatureName}
          />
          <Field
            id="address"
            label="Dirección"
            defaultValue={settings.address}
          />
          <Field
            id="phone"
            label="Teléfono"
            defaultValue={settings.phone}
          />
          <Field
            id="email"
            label="Email de empresa"
            defaultValue={settings.email}
          />

          {state.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              {state.success}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  defaultValue,
  required = false,
}: {
  id: string;
  label: string;
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}
