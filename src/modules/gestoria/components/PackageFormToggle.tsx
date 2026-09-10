"use client";

import { useState } from "react";
import { PackageForm } from "./PackageForm";

export function PackageFormToggle() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
        + Nuevo paquete
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border p-5 space-y-4 mt-2">
      <h2 className="text-sm font-semibold">Nuevo paquete de gestoría</h2>
      <PackageForm onCancel={() => setOpen(false)} />
    </div>
  );
}
