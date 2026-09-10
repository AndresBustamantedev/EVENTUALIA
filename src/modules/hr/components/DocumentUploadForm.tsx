"use client";

/**
 * Formulario de subida de documentos de empleado.
 * Llama a uploadEmployeeDocumentAction vía useActionState.
 */

import { useActionState, useRef, useState } from "react";
import {
  uploadEmployeeDocumentAction,
  type UploadDocState,
} from "@/modules/hr/actions/employeeDocuments";
import {
  DOC_CATEGORIES,
  DOC_CATEGORY_LABELS,
  DOC_STATUS_LABELS,
} from "@/modules/hr/lib/documentUtils";

interface Props {
  employeeId: string;
}

const INITIAL: UploadDocState = {};

export function DocumentUploadForm({ employeeId }: Props) {
  const [state, formAction, pending] = useActionState(
    uploadEmployeeDocumentAction,
    INITIAL
  );

  const formRef = useRef<HTMLFormElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Limpiar formulario al éxito
  if (state.success && formRef.current) {
    formRef.current.reset();
    setSelectedFile(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && fileInputRef.current) {
      // Crear un DataTransfer para asignar el archivo al input
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
      setSelectedFile(file);
    }
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {/* employeeId oculto */}
      <input type="hidden" name="employeeId" value={employeeId} />

      {/* Categoría */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Categoría <span className="text-destructive">*</span>
        </label>
        <select
          name="category"
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Selecciona categoría…</option>
          {DOC_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {DOC_CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
      </div>

      {/* Título */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Título <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          name="title"
          required
          maxLength={200}
          placeholder="Ej: Contrato indefinido 2024"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Año / Mes */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Año</label>
          <select
            name="year"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">—</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Mes</label>
          <select
            name="month"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">—</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m.toString().padStart(2, "0")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Fecha del documento */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Fecha del documento
        </label>
        <input
          type="date"
          name="docDate"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Estado */}
      <div>
        <label className="block text-sm font-medium mb-1">Estado</label>
        <select
          name="status"
          defaultValue="PENDING"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {Object.entries(DOC_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* Notas */}
      <div>
        <label className="block text-sm font-medium mb-1">Notas</label>
        <textarea
          name="notes"
          rows={2}
          maxLength={500}
          placeholder="Observaciones opcionales…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      {/* Zona de arrastrar/soltar */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Archivo <span className="text-destructive">*</span>
        </label>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-md border-2 border-dashed px-6 py-8 text-center transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
        >
          {selectedFile ? (
            <p className="text-sm font-medium">{selectedFile.name}</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Arrastra un archivo aquí o haz clic para seleccionar
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF, JPG o PNG · Máx. 20 MB
              </p>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          name="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {/* Mensajes */}
      {state.error && (
        <p className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-md bg-green-100 text-green-800 text-sm px-3 py-2">
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
      >
        {pending ? "Subiendo…" : "Subir documento"}
      </button>
    </form>
  );
}
