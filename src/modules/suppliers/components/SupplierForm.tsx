"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupplierRow, TagRow, SupplierBranch } from "../types";
import type { SupplierFormState } from "../types";
import { createTagAction } from "../actions/suppliers";

const INPUT_CLASS = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";
const LABEL_CLASS = "block text-sm font-medium mb-1";
const ERROR_CLASS = "mt-1 text-xs text-destructive";

const BRANCH_OPTIONS: { value: SupplierBranch; label: string; icon: string }[] = [
  { value: "RESTAURANT",    label: "Restaurante",  icon: "🍽️" },
  { value: "CONSTRUCTION",  label: "Construcción", icon: "🏗️" },
  { value: "BOTH",          label: "Ambas ramas",  icon: "🔄" },
];

const TAG_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#64748b",
];

interface Props {
  mode:      "create" | "edit";
  supplier?: SupplierRow;
  allTags:   TagRow[];
  action:    (prev: SupplierFormState, formData: FormData) => Promise<SupplierFormState>;
}

export function SupplierForm({ mode, supplier, allTags, action }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(action, {});

  // ── Branch ──────────────────────────────────────────────────
  const [branch, setBranch] = useState<SupplierBranch>(supplier?.branch ?? "BOTH");

  // ── Tags ────────────────────────────────────────────────────
  const [tags, setTags] = useState<TagRow[]>(allTags);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(
    new Set(supplier?.tags?.map(t => t.id) ?? [])
  );
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [tagError, setTagError] = useState<string | null>(null);
  const [creatingTag, setCreatingTag] = useState(false);

  useEffect(() => {
    if (state.success && state.supplierId) router.push(`/suppliers/${state.supplierId}`);
    else if (state.success && mode === "edit") router.refresh();
  }, [state.success, state.supplierId, mode, router]);

  const fe = state.fieldErrors ?? {};
  const fieldError = (f: string) =>
    fe[f]?.[0] ? <p className={ERROR_CLASS}>{fe[f][0]}</p> : null;

  function toggleTag(id: string) {
    setSelectedTagIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    setCreatingTag(true);
    setTagError(null);
    const res = await createTagAction(newTagName.trim(), newTagColor);
    if (res.error) { setTagError(res.error); setCreatingTag(false); return; }
    if (res.tag) {
      setTags(prev => [...prev, res.tag!].sort((a,b) => a.name.localeCompare(b.name)));
      setSelectedTagIds(prev => new Set([...prev, res.tag!.id]));
      setNewTagName("");
    }
    setCreatingTag(false);
  }

  return (
    <form action={formAction} className="space-y-6 max-w-2xl">
      {/* Hidden fields */}
      {mode === "edit" && supplier && (
        <>
          <input type="hidden" name="id" value={supplier.id} />
          <input type="hidden" name="isActive" value={String(supplier.isActive)} />
        </>
      )}
      <input type="hidden" name="branch" value={branch} />
      <input type="hidden" name="tagIds" value={[...selectedTagIds].join(",")} />

      {state.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}
      {state.success && mode === "edit" && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
          Proveedor actualizado correctamente.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label htmlFor="name" className={LABEL_CLASS}>
            Nombre <span className="text-destructive">*</span>
          </label>
          <input id="name" name="name" type="text" defaultValue={supplier?.name} required disabled={isPending} className={INPUT_CLASS} />
          {fieldError("name")}
        </div>

        <div>
          <label htmlFor="taxId" className={LABEL_CLASS}>CIF / NIF</label>
          <input id="taxId" name="taxId" type="text" defaultValue={supplier?.taxId ?? ""} disabled={isPending} className={INPUT_CLASS} placeholder="B00000000" />
          {fieldError("taxId")}
        </div>

        <div>
          <label htmlFor="contactName" className={LABEL_CLASS}>Persona de contacto</label>
          <input id="contactName" name="contactName" type="text" defaultValue={supplier?.contactName ?? ""} disabled={isPending} className={INPUT_CLASS} />
          {fieldError("contactName")}
        </div>

        <div>
          <label htmlFor="email" className={LABEL_CLASS}>Email</label>
          <input id="email" name="email" type="email" defaultValue={supplier?.email ?? ""} disabled={isPending} className={INPUT_CLASS} />
          {fieldError("email")}
        </div>

        <div>
          <label htmlFor="phone" className={LABEL_CLASS}>Teléfono</label>
          <input id="phone" name="phone" type="tel" defaultValue={supplier?.phone ?? ""} disabled={isPending} className={INPUT_CLASS} />
          {fieldError("phone")}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="address" className={LABEL_CLASS}>Dirección</label>
          <input id="address" name="address" type="text" defaultValue={supplier?.address ?? ""} disabled={isPending} className={INPUT_CLASS} />
          {fieldError("address")}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="website" className={LABEL_CLASS}>Sitio web</label>
          <input id="website" name="website" type="url" defaultValue={supplier?.website ?? ""} disabled={isPending} className={INPUT_CLASS} placeholder="https://ejemplo.com" />
          {fieldError("website")}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="notes" className={LABEL_CLASS}>Notas internas</label>
          <textarea id="notes" name="notes" rows={3} defaultValue={supplier?.notes ?? ""} disabled={isPending} className={INPUT_CLASS} />
          {fieldError("notes")}
        </div>
      </div>

      {/* ── Rama ── */}
      <div>
        <p className={LABEL_CLASS}>Rama de negocio</p>
        <div className="flex flex-wrap gap-2 mt-1">
          {BRANCH_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setBranch(opt.value)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${
                branch === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-input bg-background hover:bg-muted"
              }`}
            >
              <span>{opt.icon}</span> {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tags ── */}
      <div>
        <p className={LABEL_CLASS}>Etiquetas</p>
        <div className="flex flex-wrap gap-2 mt-1">
          {tags.map(tag => {
            const selected = selectedTagIds.has(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border-2 transition-all ${
                  selected ? "text-white shadow-sm" : "bg-background text-muted-foreground"
                }`}
                style={selected
                  ? { backgroundColor: tag.color, borderColor: tag.color }
                  : { borderColor: tag.color + "60" }}
              >
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: tag.color }} />
                {tag.name}
                {selected && <span className="ml-0.5">✓</span>}
              </button>
            );
          })}
        </div>

        {/* Crear nueva etiqueta inline */}
        <details className="mt-3">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
            + Nueva etiqueta
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleCreateTag())}
              placeholder="Nombre de la etiqueta"
              maxLength={40}
              className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring w-44"
            />
            <div className="flex gap-1">
              {TAG_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewTagColor(c)}
                  className={`w-5 h-5 rounded-full transition-transform ${newTagColor === c ? "ring-2 ring-offset-1 ring-foreground scale-110" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={handleCreateTag}
              disabled={creatingTag || !newTagName.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {creatingTag ? "Creando…" : "Crear"}
            </button>
            {tagError && <span className="text-xs text-destructive">{tagError}</span>}
          </div>
        </details>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-6 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {isPending ? "Guardando…" : mode === "create" ? "Crear proveedor" : "Guardar cambios"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border px-4 py-2 text-sm hover:bg-muted transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
