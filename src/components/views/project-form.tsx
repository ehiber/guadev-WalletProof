"use client";

import { useSession } from "@/components/session/session-provider";
import { RequiredMark, RequiredNote } from "@/components/ui/ui";
import { currencyChoices, isCryptoCurrency } from "@/lib/engine/currency";
import type { VendorCard } from "@/lib/vendors/directory";
import { ArrowLeft, ArrowRight, Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";

const VENDOR_PREVIEW = 5;

export function ProjectCreateView({ projectId }: { projectId?: string }) {
  const session = useSession();
  const router = useRouter();
  const project = projectId ? session.projects.find((item) => item.id === projectId) : undefined;
  const editing = Boolean(projectId);
  const [name, setName] = useState(project?.name ?? "");
  const [code, setCode] = useState(project?.code ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [listName, setListName] = useState(project?.vendorListName ?? "");
  const [budget, setBudget] = useState(String(project?.rules.monthlyBudgetUsd ?? "0.00"));
  const [month, setMonth] = useState(project?.budgetMonth ?? new Date().toISOString().slice(0, 7));
  const [currencies, setCurrencies] = useState<string[]>(project?.currencies?.length ? project.currencies : ["USD"]);
  const [vendorIds, setVendorIds] = useState<string[]>(project?.vendorIds ?? []);
  const [currencyQuery, setCurrencyQuery] = useState("");
  const [vendorQuery, setVendorQuery] = useState("");
  const [error, setError] = useState("");

  const catalog = useMemo(() => {
    const choices = currencyChoices();
    return [...choices.filter((item) => isCryptoCurrency(item.code)), ...choices.filter((item) => !isCryptoCurrency(item.code))];
  }, []);
  const currencyNeedle = currencyQuery.trim().toLowerCase();
  const visibleCurrencies = catalog.filter(
    (item) => !currencyNeedle || item.code.toLowerCase().includes(currencyNeedle) || item.name.toLowerCase().includes(currencyNeedle),
  );

  const toggleCurrency = (code: string) => {
    setCurrencies((current) => (current.includes(code) ? current.filter((item) => item !== code) : [...current, code]));
  };

  const toggleVendor = (id: string) => {
    setVendorIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    const normalized = code.trim().toUpperCase();
    if (!trimmed || !/^[A-Z0-9_-]{2,20}$/.test(normalized)) {
      setError("Escribe un nombre y un código de 2 a 20 letras, números o guiones.");
      return;
    }
    if (!listName.trim()) {
      setError("Escribe el nombre de la lista de proveedores.");
      return;
    }
    const monthly = Number(budget);
    if (budget.trim() === "" || !Number.isFinite(monthly) || monthly < 0) {
      setError("El presupuesto del periodo tiene que ser un importe en USD.");
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      setError("Elige el mes del presupuesto.");
      return;
    }
    if (currencies.length === 0) {
      setError("Selecciona al menos una moneda.");
      return;
    }
    const input = {
      name: trimmed,
      code: normalized,
      description,
      vendorListName: listName,
      budgetMonth: month,
      currencies,
      vendorIds,
      monthlyBudgetUsd: monthly,
    };
    if (projectId) {
      if (!session.updateProject(projectId, input)) {
        setError("Ese código ya identifica otro proyecto.");
        return;
      }
      router.push(`/proyectos/${projectId}`);
      return;
    }
    const id = session.addProject(input);
    if (!id) {
      setError("Ese código ya identifica otro proyecto.");
      return;
    }
    router.push(`/proyectos/${id}`);
  };

  if (editing && !project) {
    return (
      <section className="panel empty-state">
        <h1>Proyecto no encontrado</h1>
        <p>El proyecto que intentas editar no existe o ya no está disponible.</p>
        <Link className="btn" href="/proyectos">
          <ArrowLeft className="icon" /> Volver a proyectos
        </Link>
      </section>
    );
  }

  return (
    <form className="pg-create" onSubmit={submit}>
      <Link className="back" href="/proyectos">
        <ArrowLeft className="icon" /> Todos los proyectos
      </Link>
      <div className="page-heading">
        <div>
          <h1>{editing ? "Editar proyecto" : "Crear proyecto"}</h1>
          <p>
            {editing
              ? "Actualiza sus datos, presupuesto, monedas y proveedores. Sus criterios específicos se conservarán."
              : "Configura su presupuesto, monedas y proveedores. Puedes ajustar sus criterios después."}
          </p>
          <RequiredNote />
        </div>
        <div className="heading-actions">
          <button className="btn primary" type="submit">
            <Check className="icon" /> {editing ? "Guardar cambios" : "Crear proyecto"}
          </button>
        </div>
      </div>

      <div className="pg-editor">
        <div className="pg-editor-main">
          <section className="panel pg-section">
            <h2>Datos del proyecto</h2>
            <div className="form-grid">
              <label className="field">
                <span>
                  Nombre del proyecto
                  <RequiredMark />
                </span>
                <input
                  value={name}
                  maxLength={80}
                  required
                  autoFocus
                  placeholder="Ej. Expansión Colombia"
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>
                  Código de referencia
                  <RequiredMark />
                </span>
                <input
                  value={code}
                  maxLength={20}
                  required
                  placeholder="Ej. COL-2026"
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                />
                <small>Se usa para identificar el proyecto en las facturas.</small>
              </label>
            </div>
            <label className="field">
              <span>
                Descripción <span className="muted">(opcional)</span>
              </span>
              <textarea value={description} maxLength={300} rows={2} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label className="field">
              <span>
                Nombre de la lista de proveedores
                <RequiredMark />
              </span>
              <input
                value={listName}
                maxLength={100}
                required
                placeholder="Ej. Proveedores · Expansión Colombia"
                onChange={(event) => setListName(event.target.value)}
              />
            </label>
          </section>

          <section className="panel pg-section">
            <h2>Presupuesto</h2>
            <div className="form-grid">
              <label className="field">
                <span>
                  Presupuesto del periodo · USD
                  <RequiredMark />
                </span>
                <input
                  type="number"
                  min={0}
                  max={999999999}
                  step="0.01"
                  required
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                />
              </label>
              <label className="field">
                <span>
                  Mes del presupuesto
                  <RequiredMark />
                </span>
                <input type="month" required value={month} onChange={(event) => setMonth(event.target.value)} />
              </label>
            </div>
            <p className="pg-caption">Los importes en otras monedas se comparan en USD usando la tasa de cada evaluación.</p>
          </section>

          <section className="panel pg-section">
            <h2>
              Monedas admitidas
              <RequiredMark />
            </h2>
            <p>Selecciona las monedas en las que este proyecto puede recibir facturas.</p>
            <div className="pg-currency-chips" aria-label="Monedas seleccionadas">
              {currencies.map((code) => (
                <span key={code}>{code}</span>
              ))}
            </div>
            <label className="field">
              <span className="visually-hidden">Buscar moneda por código</span>
              <input
                type="search"
                value={currencyQuery}
                placeholder="Buscar código: USD, COP, BTC, USDT…"
                onChange={(event) => setCurrencyQuery(event.target.value)}
              />
            </label>
            <fieldset className="pg-currency-picker">
              <legend className="visually-hidden">Monedas del proyecto</legend>
              {visibleCurrencies.map((item) => (
                <label key={item.code} title={item.name}>
                  <input type="checkbox" checked={currencies.includes(item.code)} onChange={() => toggleCurrency(item.code)} />
                  {item.code}
                </label>
              ))}
            </fieldset>
            {visibleCurrencies.length === 0 ? <p className="pg-caption">No hay monedas que coincidan.</p> : null}
            <p className="pg-caption" aria-live="polite">
              {currencies.length} monedas seleccionadas
            </p>
          </section>
        </div>

        <aside className="pg-editor-side">
          <section className="panel pg-section">
            <h2>Asignar proveedores</h2>
            <p>Un proveedor puede pertenecer a varios proyectos. Sus acuerdos se gestionan por separado.</p>
            <VendorAssign
              cards={session.vendorCards}
              selectedIds={vendorIds}
              query={vendorQuery}
              onQuery={setVendorQuery}
              onToggle={toggleVendor}
            />
            <Link href="/proveedores">
              Gestionar fichas de proveedores <ArrowRight className="icon" />
            </Link>
          </section>
          <div className="pg-save-box">
            {error ? (
              <p className="field-error" role="alert">
                {error}
              </p>
            ) : null}
            <button className="btn primary" type="submit">
              <Check className="icon" /> {editing ? "Guardar cambios" : "Crear proyecto"}
            </button>
            <Link className="btn" href={projectId ? `/proyectos/${projectId}` : "/proyectos"}>
              Cancelar
            </Link>
            <p className="pg-caption">Las decisiones anteriores conservan las condiciones con las que se evaluaron.</p>
          </div>
        </aside>
      </div>
    </form>
  );
}

function VendorAssign({
  cards,
  selectedIds,
  query,
  onQuery,
  onToggle,
}: {
  cards: VendorCard[];
  selectedIds: string[];
  query: string;
  onQuery: (value: string) => void;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = new Set(selectedIds);
  const preview = [...cards]
    .sort((left, right) => Number(selected.has(right.id)) - Number(selected.has(left.id)) || left.name.localeCompare(right.name, "es"))
    .slice(0, VENDOR_PREVIEW);
  const previewIds = new Set(preview.map((card) => card.id));
  const needle = query.trim().toLowerCase();
  const rest = cards.filter((card) => {
    if (!needle && previewIds.has(card.id)) return false;
    if (!needle) return true;
    return [card.name, card.legal, card.country].join(" ").toLowerCase().includes(needle);
  });

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <fieldset className="pg-provider-picker">
        <legend className="visually-hidden">Vista previa de proveedores</legend>
        {preview.map((card) => (
          <label key={card.id}>
            <input type="checkbox" checked={selected.has(card.id)} onChange={() => onToggle(card.id)} />
            <span>
              <strong>{card.name}</strong>
              <small>{vendorLine(card)}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {cards.length > VENDOR_PREVIEW ? (
        <div className="pg-vendor-menu" ref={root}>
          <input
            type="search"
            value={query}
            placeholder="Buscar más proveedores"
            aria-label="Buscar más proveedores"
            aria-expanded={open}
            aria-controls={listId}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              onQuery(event.target.value);
              setOpen(true);
            }}
          />
          <ChevronDown className="icon" aria-hidden="true" />
          {open ? (
            <ul id={listId} role="listbox" aria-label="Resto de proveedores">
              {rest.length === 0 ? (
                <li className="pg-caption">No hay proveedores que coincidan.</li>
              ) : (
                rest.map((card) => (
                  <li key={card.id}>
                    <button type="button" role="option" aria-selected={selected.has(card.id)} onClick={() => onToggle(card.id)}>
                      <strong>{card.name}</strong>
                      <small>{vendorLine(card)}</small>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function vendorLine(card: VendorCard) {
  return `${card.country} · ${card.currencies.join(" / ") || "USD"}`;
}
