"use client";

import { useSession } from "@/components/session/session-provider";
import { Dialog, RequiredMark, RequiredNote } from "@/components/ui/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

export function ProjectCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} title="Crear proyecto" className="id-modal" onClose={onClose}>
      {open ? <ProjectCreateForm onClose={onClose} /> : null}
    </Dialog>
  );
}

function ProjectCreateForm({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [budget, setBudget] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    const normalized = code.trim().toUpperCase();
    if (!trimmed || !/^[A-Z0-9_-]{2,20}$/.test(normalized)) {
      setError("Escribe un nombre y un código de 2 a 20 letras, números o guiones.");
      return;
    }
    const monthly = budget.trim() === "" ? undefined : Number(budget);
    if (monthly != null && (!Number.isFinite(monthly) || monthly < 0)) {
      setError("El tope del proyecto tiene que ser un importe en USD.");
      return;
    }
    const id = session.addProject({ name: trimmed, code: normalized, monthlyBudgetUsd: monthly });
    if (!id) {
      setError("Ese código ya identifica otro proyecto.");
      return;
    }
    onClose();
    router.push(`/proyectos/${id}`);
  };

  return (
    <form className="pg-form" onSubmit={submit}>
      <p>El proyecto hereda las reglas de la empresa. Aquí solo guardas un tope distinto, si hace falta.</p>
      <RequiredNote />
      <label className="field">
        <span>
          Nombre
          <RequiredMark />
        </span>
        <input value={name} maxLength={80} required aria-required="true" autoFocus onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field">
        <span>
          Código
          <RequiredMark />
        </span>
        <input value={code} maxLength={20} required aria-required="true" placeholder="Ej. AND-26" onChange={(event) => setCode(event.target.value)} />
      </label>
      <label className="field">
        <span>Tope mensual en USD</span>
        <input
          value={budget}
          inputMode="decimal"
          placeholder="Solo números, ej. 2500"
          onChange={(event) => setBudget(event.target.value)}
        />
      </label>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="button-row">
        <button className="btn" type="button" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn primary" type="submit">
          Crear proyecto
        </button>
      </div>
    </form>
  );
}
