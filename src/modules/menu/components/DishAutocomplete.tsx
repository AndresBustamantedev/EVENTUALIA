"use client";

/**
 * DishAutocomplete — campo de entrada libre para platos.
 *
 * Flujo principal:
 *  1. El usuario escribe el nombre del plato directamente.
 *  2. Pulsando Enter o el botón "+" se llama a onAddByName(text) para
 *     crear/buscar el plato en el catálogo y añadirlo al menú.
 *  3. Opcionalmente se muestran sugerencias del catálogo; al hacer clic
 *     o pulsar Enter sobre una sugerencia resaltada se llama a onSelect(dish).
 *  4. Navegación por teclado: ArrowDown/ArrowUp mueven el foco en las sugerencias;
 *     Enter sobre una sugerencia la añade directamente.
 */

import { useState, useRef, useTransition, useEffect, useCallback } from "react";
import { searchDishes } from "@/modules/menu/actions/dishes";
import type { DishRow } from "@/modules/menu/actions/dishes";

export interface DishAutocompleteProps {
  category: string;
  /** Añadir plato existente del catálogo (click en sugerencia) */
  onSelect: (dish: DishRow) => void;
  /** Añadir plato nuevo/existente por nombre libre (Enter o botón +) */
  onAddByName: (name: string) => Promise<void>;
  placeholder?: string;
  disabled?: boolean;
}

export function DishAutocomplete({
  category,
  onSelect,
  onAddByName,
  placeholder = "Escribe un plato y pulsa Enter…",
  disabled = false,
}: DishAutocompleteProps) {
  const [query, setQuery]           = useState("");
  const [results, setResults]       = useState<DishRow[]>([]);
  const [open, setOpen]             = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [, startSearch]             = useTransition();
  const timerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef                  = useRef<HTMLDivElement>(null);
  const inputRef                    = useRef<HTMLInputElement>(null);
  const listRef                     = useRef<HTMLUListElement>(null);

  const search = useCallback(
    (q: string) => {
      if (!q.trim()) { setResults([]); setOpen(false); setActiveIndex(-1); return; }
      startSearch(async () => {
        const res = await searchDishes(q, category || undefined);
        setResults(res);
        setOpen(res.length > 0);
        setActiveIndex(-1);
      });
    },
    [category]
  );

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(query), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, search]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Scroll automático al item activo
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    // +1 because first <li> is the header
    const items = listRef.current.querySelectorAll<HTMLLIElement>("li[data-item]");
    items[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  async function commitName() {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    await onAddByName(trimmed);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open || results.length === 0) return;
      setActiveIndex(prev => (prev + 1) % results.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open || results.length === 0) return;
      setActiveIndex(prev => (prev <= 0 ? results.length - 1 : prev - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && activeIndex >= 0 && results[activeIndex]) {
        handleSelect(results[activeIndex]);
      } else {
        void commitName();
      }
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  function handleSelect(dish: DishRow) {
    onSelect(dish);
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  return (
    <div ref={wrapperRef} className="relative flex gap-2">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setActiveIndex(-1); }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-activedescendant={activeIndex >= 0 ? `dish-option-${activeIndex}` : undefined}
        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm
                   placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring
                   disabled:opacity-50 disabled:cursor-not-allowed"
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => void commitName()}
        disabled={disabled || query.trim().length < 2}
        title="Añadir plato"
        className="shrink-0 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium
                   hover:bg-accent hover:text-accent-foreground
                   disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        +
      </button>

      {/* Sugerencias del catálogo */}
      {open && results.length > 0 && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border border-input bg-card text-card-foreground
                     shadow-lg max-h-52 overflow-y-auto"
        >
          <li className="px-3 py-1.5 text-xs text-muted-foreground border-b border-input select-none">
            Sugerencias del catálogo — haz clic o usa ↑↓ + Enter
          </li>
          {results.map((dish, idx) => (
            <li key={dish.id} data-item role="option" aria-selected={idx === activeIndex}
                id={`dish-option-${idx}`}>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); handleSelect(dish); }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`w-full px-3 py-2 text-left text-sm transition-colors
                  ${idx === activeIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/60 hover:text-accent-foreground"
                  }`}
              >
                <span className="block font-medium leading-snug truncate">{dish.name}</span>
                {dish.allergens && (
                  <span className="block text-xs text-muted-foreground leading-snug truncate mt-0.5">
                    {dish.allergens}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
