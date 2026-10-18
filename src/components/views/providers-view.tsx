"use client";

import { useSession } from "@/components/session/session-provider";
import { statusClass, statusLabel, vendorInitials } from "@/lib/format";
import {
  VENDOR_CATEGORIES,
  VENDOR_STATUSES,
  approvalAccounts,
  cardFromDraft,
  maskAccount,
  vendorStatusClass,
  vendorStatusLabel,
  type BankAccount,
  type VendorCard,
  type VendorDraft,
  type VendorStatus,
} from "@/lib/vendors/directory";
import { ArrowLeft, Mail, Plus, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

const CREATE_LOADER = "Rellenando datos bancarios con fines de la demo.";

async function createFictionalVendor(keys: unknown): Promise<VendorCard> {
  const response = await fetch("/api/vendors/draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ keys }),
  });
  const body = (await response.json().catch(() => null)) as { error?: string; draft?: VendorDraft } | null;
  if (!response.ok || !body?.draft) throw new Error(body?.error ?? "No se pudo crear el proveedor.");
  return cardFromDraft(body.draft);
}

function CreateLoader() {
  return (
    <div className="notice info demo-loader" role="status">
      <i aria-hidden="true" />
      <p>{CREATE_LOADER}</p>
    </div>
  );
}

export function ProvidersView() {
  const session = useSession();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | VendorStatus>("all");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const visible = useMemo(
    () =>
      session.vendorCards.filter((vendor) => {
        const matches = filter === "all" || vendor.status === filter;
        const haystack = `${vendor.name} ${vendor.legal} ${vendor.country}`.toLowerCase();
        return matches && haystack.includes(query.trim().toLowerCase());
      }),
    [filter, query, session.vendorCards],
  );

  async function createVendor() {
    setCreating(true);
    setCreateError(null);
    try {
      const card = await createFictionalVendor(session.keys);
      session.saveVendorCard(card);
      router.push(`/proveedores/${card.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo crear el proveedor.";
      if (message.toLowerCase().includes("clave")) session.setByokOpen(true);
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Proveedores</h1>
          <p>Acuerdos, monedas y lista autorizada en un solo lugar.</p>
        </div>
        <div className="heading-actions">
          <button className="btn primary" type="button" disabled={creating} onClick={() => void createVendor()}>
            <Sparkles className="icon" /> {creating ? "Creando…" : "Crear proveedor"}
          </button>
          <Link className="btn" href="/proveedores/nuevo">
            <Plus className="icon" /> Añadir proveedor
          </Link>
          <span className="badge neutral">Lista del sandbox</span>
        </div>
      </div>
      <div className="notice info">
        <p>Autorizar un proveedor permite evaluar sus facturas según las reglas. Los duplicados, cambios de cuenta y límites siguen revisándose.</p>
      </div>
      {creating ? <CreateLoader /> : null}
      {createError ? (
        <div className="notice error">
          <p>{createError}</p>
        </div>
      ) : null}
      <section className="table-card" aria-label="Proveedores">
        <div className="table-toolbar">
          <label className="search">
            <Search className="icon" />
            <span className="visually-hidden">Buscar proveedor</span>
            <input type="search" value={query} placeholder="Buscar proveedor" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <label className="field" style={{ margin: 0, minWidth: 180 }}>
            <span className="visually-hidden">Estado</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
              <option value="all">Todos</option>
              {VENDOR_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {vendorStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {visible.length === 0 ? (
          <div className="empty">
            <h2>No hay proveedores que coincidan</h2>
            <p>Cambia el estado o la búsqueda.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Proveedor</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Monedas</th>
                  <th scope="col">Servicio acordado</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((vendor) => (
                  <tr key={vendor.id}>
                    <td>
                      <div className="vendor-cell">
                        <span className="vendor-icon">{vendorInitials(vendor.id, vendor.name)}</span>
                        <div>
                          <strong>{vendor.name}</strong>
                          <small>{vendor.country}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={vendorStatusClass(vendor.status)}>{vendorStatusLabel(vendor.status)}</span>
                    </td>
                    <td>{vendor.currencies.join(", ")}</td>
                    <td>{vendor.service || "Por registrar"}</td>
                    <td>
                      <Link className="btn sm" href={`/proveedores/${vendor.id}`}>
                        Editar ficha
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="page-footer">Crear proveedor inventa una ficha y una cuenta ficticias. Una cuenta nueva de una factura solo se agrega al aprobar esa excepción.</p>
    </>
  );
}

export function ProviderDetailView({ id }: { id: string }) {
  return <ProviderEditor key={id} id={id} />;
}

export function ProviderEditor({ id }: { id: string }) {
  const session = useSession();
  const router = useRouter();
  const fresh = id === "nuevo";
  const saved = fresh ? undefined : session.vendorCards.find((item) => item.id === id);
  const [name, setName] = useState(saved?.name ?? "");
  const [email, setEmail] = useState(saved?.email ?? "");
  const [legal, setLegal] = useState(saved?.legal ?? "");
  const [country, setCountry] = useState(saved?.country ?? "");
  const [service, setService] = useState(saved?.service ?? "");
  const [category, setCategory] = useState(saved?.category ?? VENDOR_CATEGORIES[0]);
  const [currencies, setCurrencies] = useState(saved?.currencies.join(", ") ?? "USD");
  const [status, setStatus] = useState<VendorStatus>(saved?.status ?? "unregistered");
  const [comment, setComment] = useState("");
  const [banks, setBanks] = useState<BankAccount[]>(saved?.bankAccounts ?? []);
  const [notes, setNotes] = useState(saved?.notes ?? []);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [creating, setCreating] = useState(false);

  if (!fresh && !saved) {
    return (
      <>
        <Link href="/proveedores" className="back">
          <ArrowLeft className="icon" /> Proveedores
        </Link>
        <h1>Proveedor no encontrado</h1>
      </>
    );
  }

  const approved = saved
    ? approvalAccounts(saved.id, session.invoices, session.human, session.records)
    : [];
  const invoices = saved ? session.invoices.filter((invoice) => invoice.vendorId === saved.id) : [];

  function syncHolder(nextName: string) {
    setName(nextName);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Escribe el nombre del proveedor.");
      return;
    }
    const parsedCurrencies = currencies
      .toUpperCase()
      .split(",")
      .map((item) => item.trim())
      .filter((item) => /^[A-Z]{3,5}$/.test(item));
    const nextCurrencies = parsedCurrencies.length > 0 ? parsedCurrencies : ["USD"];
    const now = new Date().toISOString();
    const nextNotes = [
      ...notes,
      {
        id: `note-${crypto.randomUUID()}`,
        title: fresh ? "Proveedor registrado" : "Ficha actualizada",
        body: comment.trim() || "Sin comentario adicional.",
        at: now,
        actor: "Equipo de finanzas",
      },
    ];
    const card: VendorCard = {
      id: saved?.id ?? `vendor-${crypto.randomUUID().slice(0, 8)}`,
      name: trimmed,
      legal: legal.trim() || trimmed,
      email: email.trim(),
      country: country.trim(),
      service: service.trim(),
      category,
      currencies: nextCurrencies,
      status,
      costCenter: saved?.costCenter ?? "Other",
      bankAccounts: banks,
      notes: nextNotes,
      demoFilled: false,
    };
    session.saveVendorCard(card);
    router.push(`/proveedores/${card.id}`);
  }

  function saveBank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const account: BankAccount = {
      id: editing !== null && editing >= 0 ? (banks[editing]?.id ?? `bank-${crypto.randomUUID()}`) : `bank-${crypto.randomUUID()}`,
      bank: String(data.get("bank") ?? "").trim(),
      holder: String(data.get("holder") ?? "").trim(),
      country: String(data.get("country") ?? "").trim(),
      currency: String(data.get("currency") ?? "").trim().toUpperCase(),
      identifier: String(data.get("identifier") ?? "").trim(),
    };
    if (!account.bank || !account.holder || !account.country || !/^[A-Z]{3,5}$/.test(account.currency) || !account.identifier) {
      setError("Completa banco, titular, país, una moneda válida y el identificador.");
      return;
    }
    if (banks.some((item, index) => index !== editing && item.identifier === account.identifier)) {
      setError("Esta cuenta ya está registrada.");
      return;
    }
    setError(null);
    setBanks((current) => {
      if (editing === null || editing < 0) return [...current, account];
      return current.map((item, index) => (index === editing ? account : item));
    });
    setEditing(null);
  }

  function saveNote(event: FormEvent) {
    event.preventDefault();
    const body = noteBody.trim();
    if (!body || !saved) return;
    const note = {
      id: `note-${crypto.randomUUID()}`,
      title: "Nota",
      body,
      at: new Date().toISOString(),
      actor: "Equipo de finanzas",
    };
    const next = [...notes, note];
    setNotes(next);
    setNoteBody("");
    session.saveVendorCard({ ...saved, notes: next, bankAccounts: banks });
  }

  async function createVendor() {
    setCreating(true);
    setError(null);
    try {
      const card = await createFictionalVendor(session.keys);
      session.saveVendorCard(card);
      router.push(`/proveedores/${card.id}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No se pudo crear el proveedor.";
      if (message.toLowerCase().includes("clave")) session.setByokOpen(true);
      setError(message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Link href="/proveedores" className="back">
        <ArrowLeft className="icon" /> Proveedores
      </Link>
      <div className="page-heading">
        <div>
          <h1>{fresh ? "Añadir proveedor" : name || saved?.name}</h1>
          <p>{fresh ? "Completa la ficha a mano o crea un proveedor ficticio." : vendorStatusLabel(status)}</p>
        </div>
        {fresh ? (
          <button className="btn primary" type="button" disabled={creating} onClick={() => void createVendor()}>
            <Sparkles className="icon" /> {creating ? "Creando…" : "Crear proveedor"}
          </button>
        ) : (
          <Link className="btn" href="/correo">
            <Mail className="icon" /> Ver correos
          </Link>
        )}
      </div>
      {creating ? <CreateLoader /> : null}
      {error ? (
        <div className="notice error">
          <p>{error}</p>
        </div>
      ) : null}
      <div className="provider-layout">
        <form className="panel" onSubmit={save}>
          <h2>Datos del proveedor</h2>
          <div className="form-grid">
            <label className="field">
              <span>Nombre</span>
              <input required value={name} onChange={(event) => syncHolder(event.target.value)} />
            </label>
            <label className="field">
              <span>Correo</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="field">
              <span>Nombre legal</span>
              <input value={legal} onChange={(event) => setLegal(event.target.value)} />
            </label>
            <label className="field">
              <span>País</span>
              <input value={country} onChange={(event) => setCountry(event.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>Servicio acordado</span>
            <textarea value={service} onChange={(event) => setService(event.target.value)} />
          </label>
          <label className="field">
            <span>Categoría</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {VENDOR_CATEGORIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Monedas admitidas · separadas por coma</span>
            <input value={currencies} onChange={(event) => setCurrencies(event.target.value)} />
          </label>
          <label className="field">
            <span>Lista autorizada</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as VendorStatus)}>
              {VENDOR_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {vendorStatusLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Comentario</span>
            <textarea value={comment} maxLength={600} onChange={(event) => setComment(event.target.value)} />
          </label>
          <button className="btn primary" type="submit">
            Guardar proveedor
          </button>
        </form>
        <div>
          <section className="panel">
            <div className="section-heading">
              <h2>Datos bancarios</h2>
              <button className="btn sm" type="button" onClick={() => setEditing(-1)}>
                Añadir cuenta
              </button>
            </div>
            <p className="small muted">Cuentas disponibles para los pagos de este proveedor.</p>
            {banks.length === 0 ? <p className="empty">Todavía no hay cuentas registradas.</p> : null}
            {banks.map((account, index) => (
              <div key={account.id} className="bank-row">
                <strong>
                  {account.bank} · {maskAccount(account.identifier)}
                </strong>
                <p>
                  {account.holder} · {account.country} · {account.currency}
                </p>
                <div className="button-row">
                  <button className="text-btn" type="button" onClick={() => setEditing(index)}>
                    Editar
                  </button>
                  <button className="text-btn" type="button" onClick={() => setBanks((current) => current.filter((item) => item.id !== account.id))}>
                    Quitar
                  </button>
                </div>
              </div>
            ))}
            {approved.map((item) => (
              <div key={item.invoiceId} className="bank-row">
                <strong>Cuenta añadida al aprobar · {item.invoiceId}</strong>
                <p>{item.line}. La cuenta anterior se conserva.</p>
              </div>
            ))}
            {editing !== null ? (
              <form id="bank-editor" onSubmit={saveBank}>
                <h3>{editing < 0 ? "Añadir cuenta" : "Editar cuenta"}</h3>
                <div className="form-grid">
                  <label className="field">
                    <span>Banco</span>
                    <input name="bank" required defaultValue={editing >= 0 ? banks[editing]?.bank : "Banco de ejemplo"} />
                  </label>
                  <label className="field">
                    <span>Titular</span>
                    <input name="holder" required defaultValue={editing >= 0 ? banks[editing]?.holder : name || "Titular de la demo"} />
                  </label>
                  <label className="field">
                    <span>País del banco</span>
                    <input name="country" required defaultValue={editing >= 0 ? banks[editing]?.country : country || "Colombia"} />
                  </label>
                  <label className="field">
                    <span>Moneda</span>
                    <input name="currency" required defaultValue={editing >= 0 ? banks[editing]?.currency : "USD"} />
                  </label>
                  <label className="field">
                    <span>Identificador de cuenta ficticio</span>
                    <input name="identifier" required defaultValue={editing >= 0 ? banks[editing]?.identifier : ""} />
                  </label>
                </div>
                <div className="button-row">
                  <button className="btn primary" type="submit">
                    Guardar cuenta
                  </button>
                  <button className="btn" type="button" onClick={() => setEditing(null)}>
                    Cancelar
                  </button>
                </div>
              </form>
            ) : null}
          </section>
          {fresh ? null : (
            <section className="panel notes-panel">
              <h2>Notas e historial</h2>
              <form onSubmit={saveNote}>
                <label className="field">
                  <span>Añadir nota</span>
                  <textarea required maxLength={600} value={noteBody} onChange={(event) => setNoteBody(event.target.value)} />
                </label>
                <button className="btn" type="submit">
                  Guardar nota
                </button>
              </form>
              {[...notes].reverse().map((note) => (
                <article key={note.id} className="provider-note">
                  <strong>{note.title}</strong>
                  <p>{note.body}</p>
                  <small>
                    {note.at.slice(0, 16).replace("T", " ")} UTC · {note.actor}
                  </small>
                </article>
              ))}
              {approved.map((item) => (
                <article key={`note-${item.invoiceId}`} className="provider-note">
                  <strong>Cuenta añadida desde {item.invoiceId}</strong>
                  <p>{item.line}</p>
                  <Link href={`/facturas/${item.invoiceId}`}>Ver {item.invoiceId}</Link>
                </article>
              ))}
              {notes.length === 0 && approved.length === 0 ? <p className="muted small">Los cambios de cuentas y las notas aparecerán aquí.</p> : null}
            </section>
          )}
          {fresh ? null : (
            <section className="panel">
              <h2>Facturas</h2>
              {invoices.length === 0 ? <p className="muted small">Este proveedor no tiene facturas en la sesión.</p> : null}
              {invoices.map((invoice) => {
                const record = session.records.find((item) => item.invoiceId === invoice.id);
                const invoiceStatus = record ? session.statusOf(record) : null;
                return (
                  <div key={invoice.id} className="preview-row">
                    <Link href={`/facturas/${invoice.id}`}>
                      {invoice.id}
                    </Link>
                    {invoiceStatus ? <span className={statusClass(invoiceStatus)}>{statusLabel(invoiceStatus)}</span> : null}
                  </div>
                );
              })}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
