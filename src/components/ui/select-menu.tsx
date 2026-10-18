"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export type SelectOption = { value: string; label: string };
export type SelectGroup = { label: string; options: SelectOption[] };

export function SelectMenu({
  label,
  value,
  defaultValue = "",
  options,
  groups,
  onChange,
  name,
  invalid = false,
  required = false,
  placeholder = "",
  className = "",
}: {
  label: string;
  value?: string;
  defaultValue?: string;
  options: SelectOption[];
  groups?: SelectGroup[];
  onChange?: (value: string) => void;
  name?: string;
  invalid?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(defaultValue);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = value ?? internal;
  const all = [...options, ...(groups?.flatMap((group) => group.options) ?? [])];
  const currentLabel = all.find((option) => option.value === current)?.label ?? "";

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    root.current?.querySelector<HTMLElement>("[aria-selected='true']")?.scrollIntoView({ block: "nearest" });
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(next: string) {
    if (value === undefined) setInternal(next);
    onChange?.(next);
    setOpen(false);
  }

  return (
    <div className={`invoice-select ${className}`.trim()} ref={root}>
      {name ? <input type="hidden" name={name} value={current} /> : null}
      <button
        type="button"
        aria-label={required ? `${label} (obligatorio)` : label}
        aria-required={required || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-invalid={invalid || undefined}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <span className={currentLabel ? undefined : "muted"}>{currentLabel || placeholder}</span>
        <ChevronDown className="icon" aria-hidden="true" />
      </button>
      {open ? (
        <ul id={listId} role="listbox" aria-label={label}>
          {options.map((option) => (
            <li key={option.value}>
              <button type="button" role="option" aria-selected={option.value === current} onClick={() => choose(option.value)}>
                {option.label}
              </button>
            </li>
          ))}
          {groups?.map((group) => (
            <li key={group.label} className="select-group">
              <span>{group.label}</span>
              <ul>
                {group.options.map((option) => (
                  <li key={option.value}>
                    <button type="button" role="option" aria-selected={option.value === current} onClick={() => choose(option.value)}>
                      {option.label}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function SearchMenu({
  label,
  value,
  defaultValue = "",
  name,
  options,
  onChange,
  required = false,
  invalid = false,
  placeholder = "Buscar",
  className = "",
}: {
  label: string;
  value?: string;
  defaultValue?: string;
  name?: string;
  options: SelectOption[];
  onChange?: (value: string) => void;
  required?: boolean;
  invalid?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [internal, setInternal] = useState(defaultValue);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = value ?? internal;
  const selected = options.find((option) => option.value === current);
  const needle = fold(query.trim());
  const matches = needle
    ? options.filter((option) => fold(option.label).includes(needle) || fold(option.value).includes(needle))
    : options;

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  function choose(next: string) {
    if (value === undefined) setInternal(next);
    onChange?.(next);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className={`vendor-suggest ${className}`.trim()} ref={root}>
      {name ? <input type="hidden" name={name} value={current} /> : null}
      <input
        role="combobox"
        aria-label={required ? `${label} (obligatorio)` : label}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder={placeholder}
        value={open ? query : (selected?.label ?? current)}
        onClick={() => setOpen(true)}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            return;
          }
          if (event.key !== "Enter") return;
          event.preventDefault();
          const exact = options.find((option) => fold(option.label) === fold(query.trim()));
          const pick = exact ?? (matches.length === 1 ? matches[0] : undefined);
          if (pick) choose(pick.value);
        }}
      />
      {open ? (
        <ul id={listId} className="vendor-menu" role="listbox" aria-label={label}>
          {matches.length === 0 ? (
            <li>
              <button type="button" disabled>
                Sin resultados
              </button>
            </li>
          ) : null}
          {matches.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === current}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option.value)}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
