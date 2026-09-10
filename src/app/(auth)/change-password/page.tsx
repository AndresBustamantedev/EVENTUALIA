"use client";

import { useActionState } from "react";
import { useEffect } from "react";
import { signOut } from "next-auth/react";
import { changePasswordAction, type ChangePasswordState } from "./actions";

const initialState: ChangePasswordState = {};

export default function ChangePasswordPage() {
  const [state, formAction, isPending] = useActionState(
    changePasswordAction,
    initialState
  );

  useEffect(() => {
    if (state.success) {
      // Cerrar sesión para forzar un token nuevo (sin mustChangePwd)
      // El usuario vuelve a entrar con su contraseña nueva y el token se genera limpio
      signOut({ callbackUrl: "/login" });
    }
  }, [state.success]);

  return (
    <div className="bg-card rounded-xl shadow-md p-8 space-y-6">
      <div className="text-center space-y-1">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center">
            <span className="text-white text-xl font-bold">CB</span>
          </div>
        </div>
        <h1 className="text-xl font-semibold">Cambio de contraseña obligatorio</h1>
        <p className="text-sm text-muted-foreground">
          Debes establecer una contraseña personal antes de continuar.
          Mínimo 12 caracteres.
        </p>
      </div>

      {state.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {state.success && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Contraseña cambiada correctamente. Cerrando sesión…
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="currentPassword"
            className="block text-sm font-medium"
          >
            Contraseña actual
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            disabled={isPending || !!state.success}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="newPassword" className="block text-sm font-medium">
            Nueva contraseña (mín. 12 caracteres)
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={12}
            disabled={isPending || !!state.success}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium"
          >
            Confirmar nueva contraseña
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={12}
            disabled={isPending || !!state.success}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
        </div>

        <button
          type="submit"
          disabled={isPending || !!state.success}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {isPending ? "Guardando…" : "Establecer contraseña"}
        </button>
      </form>
    </div>
  );
}
