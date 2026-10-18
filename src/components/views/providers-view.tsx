"use client";

import { useSession } from "@/components/session/session-provider";
import { SearchMenu, SelectMenu } from "@/components/ui/select-menu";
import { Dialog, RequiredMark, RequiredNote } from "@/components/ui/ui";
import { currencyChoices } from "@/lib/engine/currency";
import { COUNTRIES } from "@/lib/vendors/countries";
import { amount, statusClass, statusLabel, usd } from "@/lib/format";
import {
  VENDOR_CATEGORIES,
  approvalAccounts,
  cardFromDraft,
  costCenterFor,
  maskAccount,
  type BankAccount,
  type VendorAgreement,
  type VendorCard,
  type VendorDraft,
  type VendorNote,
  type VendorStatus,
} from "@/lib/vendors/directory";
import { ArrowLeft, ArrowRight, Plus, Search, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";

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

type VendorPeek = { kind: "projects" | "currencies"; vendorId: string } | null;

function ProjectTags({
  projects,
  onMore,
}: {
  projects: Array<{ id: string; name: string }>;
  onMore: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(projects.length);
  const signature = projects.map((project) => project.id).join("\u0000");

  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    const fit = () => {
      const width = node.clientWidth;
      const tags = [...node.querySelectorAll<HTMLElement>("[data-tag]")];
      const more = node.querySelector<HTMLElement>("[data-more]");
      const moreWidth = more?.offsetWidth ?? 36;
      const gap = 8;
      let used = 0;
      let next = 0;
      for (const tag of tags) {
        const reserve = tags.length - (next + 1) > 0 ? gap + moreWidth : 0;
        const gapBefore = next > 0 ? gap : 0;
        if (next > 0 && used + gapBefore + tag.offsetWidth + reserve > width) break;
        used += gapBefore + tag.offsetWidth;
        next += 1;
      }
      setCount(next);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [signature]);

  const hidden = projects.length - count;
  return (
    <div className="plist-fit" ref={host}>
      <div className="plist-fit-measure" aria-hidden="true">
        {projects.map((project) => (
          <span key={project.id} className="plist-tag" data-tag="">
            {project.name}
          </span>
        ))}
        <span className="plist-more" data-more="">
          +{Math.max(projects.length - 1, 1)}
        </span>
      </div>
      <div className="plist-tags">
        {projects.slice(0, count).map((project) => (
          <Link key={project.id} className="plist-tag" href={`/proyectos/${project.id}`} onClick={(event) => event.stopPropagation()}>
            {project.name}
          </Link>
        ))}
        {hidden > 0 ? (
          <button
            className="plist-more"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onMore();
            }}
          >
            +{hidden}
          </button>
        ) : null}
      </div>
    </div>
  );
}

const SERVICE_OPTIONS = VENDOR_CATEGORIES.filter((item) => item !== "Por confirmar");
const ACCOUNT_TYPES = ["Corriente", "Ahorros", "Internacional"] as const;

function withCurrent(options: readonly string[], current: string) {
  const values = current && !options.includes(current) ? [current, ...options] : [...options];
  return values.map((item) => ({ value: item, label: item }));
}
const ASSIGN_OPTIONS = 4;

function projectMatches(name: string, code: string, query: string) {
  const needle = query
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (!needle) return true;
  const haystack = `${name} ${code}`
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return haystack.includes(needle);
}
const EMPTY_VENDOR_FORM = { name: "", taxId: "", country: "", email: "", service: "", currency: "USD" };

export function ProvidersView() {
  const session = useSession();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [peek, setPeek] = useState<VendorPeek>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_VENDOR_FORM);
  const [nameInvalid, setNameInvalid] = useState(false);
  const currencyNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const choice of currencyChoices()) names.set(choice.code, choice.name);
    return names;
  }, []);
  const visible = useMemo(
    () =>
      session.vendorCards.filter((vendor) => {
        const projects = session.projects.filter((project) => project.vendorIds.includes(vendor.id));
        const onProject = projectId === "all" || projects.some((project) => project.id === projectId);
        return onProject && vendor.name.toLowerCase().includes(query.trim().toLowerCase());
      }),
    [projectId, query, session.projects, session.vendorCards],
  );
  const peeked = peek ? session.vendorCards.find((vendor) => vendor.id === peek.vendorId) : undefined;
  const peekedProjects = peeked ? session.projects.filter((project) => project.vendorIds.includes(peeked.id)) : [];

  function openAdd() {
    setForm(EMPTY_VENDOR_FORM);
    setNameInvalid(false);
    setAdding(true);
  }

  function addVendor(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      setNameInvalid(true);
      return;
    }
    const name = form.name.trim();
    session.saveVendorCard({
      id: `vendor-${crypto.randomUUID().slice(0, 8)}`,
      name,
      legal: name,
      email: form.email.trim(),
      country: form.country.trim(),
      taxId: form.taxId.trim() || undefined,
      service: form.service.trim(),
      category: form.service.trim() || "Por confirmar",
      currencies: [form.currency || "USD"],
      status: "unregistered",
      costCenter: costCenterFor(form.service.trim()),
      bankAccounts: [],
      notes: [],
      demoFilled: false,
    });
    setAdding(false);
  }

  return (
    <>
      <div className="page-heading">
        <h1>Proveedores</h1>
        <div className="heading-actions">
          <button className="btn primary" type="button" onClick={openAdd}>
            <Plus className="icon" /> Añadir proveedor
          </button>
        </div>
      </div>
      <div className="plist-tools">
        <label className="plist-search">
          <Search className="icon" />
          <span className="visually-hidden">Buscar por nombre</span>
          <input type="search" value={query} placeholder="Buscar por nombre" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <SelectMenu
          label="Proyecto"
          value={projectId}
          options={[
            { value: "all", label: "Todos los proyectos" },
            ...session.projects.map((project) => ({ value: project.id, label: project.name })),
          ]}
          onChange={setProjectId}
        />
      </div>
      <section className="plist plist-vendors" aria-label="Proveedores">
        {visible.length === 0 ? (
          <div className="empty">
            <h2>No hay proveedores que coincidan</h2>
            <p>Prueba con otro nombre o con todos los proyectos.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Proveedor</th>
                  <th scope="col">Servicio</th>
                  <th scope="col">Monedas</th>
                  <th scope="col">Proyectos</th>
                  <th scope="col">
                    <span className="visually-hidden">Acción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((vendor) => {
                  const projects = session.projects.filter((project) => project.vendorIds.includes(vendor.id));
                  const extraCurrencies = Math.max(0, vendor.currencies.length - 2);
                  const service = vendor.category === "Por confirmar" && vendor.service ? vendor.service : vendor.category;
                  return (
                    <tr key={vendor.id} className="iv-row" onClick={() => router.push(`/proveedores/${vendor.id}`)}>
                      <td>
                        <strong className="plist-name">{vendor.name}</strong>
                        {vendor.country ? <small>{vendor.country}</small> : null}
                      </td>
                      <td>{service || "Por confirmar"}</td>
                      <td>
                        <div className="plist-tags">
                          <span>{vendor.currencies.slice(0, 2).join(", ") || "—"}</span>
                          {extraCurrencies > 0 ? (
                            <button
                              className="plist-more"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setPeek({ kind: "currencies", vendorId: vendor.id });
                              }}
                            >
                              +{extraCurrencies}
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="plist-projects">
                        {projects.length === 0 ? (
                          <span className="plist-empty">Sin proyectos asignados</span>
                        ) : (
                          <ProjectTags
                            projects={projects.map((project) => ({ id: project.id, name: project.name }))}
                            onMore={() => setPeek({ kind: "projects", vendorId: vendor.id })}
                          />
                        )}
                      </td>
                      <td>
                        <Link className="iv-detail" href={`/proveedores/${vendor.id}`} onClick={(event) => event.stopPropagation()}>
                          Ver ficha <ArrowRight className="icon" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="plist-count">
        {visible.length} {visible.length === 1 ? "proveedor" : "proveedores"}
      </p>
      <Dialog
        open={Boolean(peeked && peek?.kind === "projects")}
        title={peeked ? `Proyectos de ${peeked.name}` : "Proyectos"}
        className="id-modal"
        onClose={() => setPeek(null)}
      >
        <p className="plist-modal-lead">
          {peekedProjects.length} {peekedProjects.length === 1 ? "proyecto vinculado" : "proyectos vinculados"}
        </p>
        <ul className="plist-modal-list">
          {peekedProjects.map((project) => (
            <li key={project.id}>
              <Link href={`/proyectos/${project.id}`}>
                <strong>{project.name}</strong>
              </Link>
            </li>
          ))}
        </ul>
        <div className="button-row">
          <button className="btn" type="button" onClick={() => setPeek(null)}>
            Cerrar
          </button>
        </div>
      </Dialog>
      <Dialog
        open={Boolean(peeked && peek?.kind === "currencies")}
        title={peeked ? `Monedas de ${peeked.name}` : "Monedas"}
        className="id-modal"
        onClose={() => setPeek(null)}
      >
        <p className="plist-modal-lead">
          {peeked?.currencies.length ?? 0} {(peeked?.currencies.length ?? 0) === 1 ? "moneda admitida" : "monedas admitidas"}
        </p>
        <ul className="plist-modal-list">
          {peeked?.currencies.map((code) => (
            <li key={code}>
              <strong>{code}</strong>
              <span>{currencyNames.get(code) ?? code}</span>
            </li>
          ))}
        </ul>
        <div className="button-row">
          <button className="btn" type="button" onClick={() => setPeek(null)}>
            Cerrar
          </button>
        </div>
      </Dialog>
      <Dialog open={adding} title="Añadir proveedor" className="id-modal" onClose={() => setAdding(false)}>
        <form className="plist-form" noValidate onSubmit={addVendor}>
          <RequiredNote />
          <label className={`field${nameInvalid ? " invalid" : ""}`}>
            <span>
              Nombre
              <RequiredMark />
            </span>
            <input
              aria-required="true"
              value={form.name}
              onChange={(event) => {
                setForm({ ...form, name: event.target.value });
                setNameInvalid(false);
              }}
            />
            {nameInvalid ? <small className="field-error">Escribe el nombre del proveedor.</small> : null}
          </label>
          <div className="vendor-pair">
            <label className="field">
              <span>Identificación fiscal / legal</span>
              <input placeholder="RIF, NIF, CIF, EIN..." value={form.taxId} onChange={(event) => setForm({ ...form, taxId: event.target.value })} />
            </label>
            <label className="field">
              <span>País</span>
              <SearchMenu
                label="País"
                placeholder="Buscar país"
                value={form.country}
                options={COUNTRIES.map((country) => ({ value: country, label: country }))}
                onChange={(country) => setForm({ ...form, country })}
              />
            </label>
          </div>
          <label className="field">
            <span>Correo</span>
            <input type="text" inputMode="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </label>
          <label className="field">
            <span>Servicio</span>
            <SelectMenu
              label="Servicio"
              placeholder="Elige un servicio"
              className="opens-up"
              value={form.service}
              options={SERVICE_OPTIONS.map((item) => ({ value: item, label: item }))}
              onChange={(service) => setForm({ ...form, service })}
            />
          </label>
          <label className="field">
            <span>Moneda inicial</span>
            <SelectMenu
              label="Moneda inicial"
              value={form.currency}
              options={currencyChoices().map((choice) => ({ value: choice.code, label: choice.code }))}
              onChange={(currency) => setForm({ ...form, currency })}
            />
          </label>
          <p className="plist-note">Se creará sin proyectos asignados. Los datos de esta muestra se conservan mientras la página está abierta.</p>
          <div className="button-row">
            <button className="btn" type="button" onClick={() => setAdding(false)}>
              Cancelar
            </button>
            <button className="btn primary" type="submit">
              Añadir proveedor
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function ProviderDetailView({ id }: { id: string }) {
  return <ProviderEditor key={id} id={id} />;
}

type VendorDraftState = {
  name: string;
  email: string;
  legal: string;
  country: string;
  taxId: string;
  service: string;
  category: string;
  currencies: string[];
  banks: BankAccount[];
  notes: VendorNote[];
  projectIds: string[];
  agreements: VendorAgreement[];
};

function noteDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function packDraft(input: {
  name: string;
  email: string;
  legal: string;
  country: string;
  taxId: string;
  service: string;
  category: string;
  currencies: string[];
  banks: BankAccount[];
  notes: VendorNote[];
  projectIds: string[];
  agreements: VendorAgreement[];
}) {
  return JSON.stringify({
    ...input,
    currencies: [...input.currencies].sort(),
    projectIds: [...input.projectIds].sort(),
    agreements: [...input.agreements]
      .map((item) => ({ ...item, currencies: [...item.currencies].sort() }))
      .sort((left, right) => left.projectId.localeCompare(right.projectId)),
  });
}

export function ProviderEditor({ id }: { id: string }) {
  const session = useSession();
  const router = useRouter();
  const fresh = id === "nuevo";
  const saved = fresh ? undefined : session.vendorCards.find((item) => item.id === id);
  const catalog = useMemo(() => currencyChoices(), []);
  const initialProjects = session.projects
    .filter((project) => saved && project.vendorIds.includes(saved.id))
    .map((project) => project.id);
  const initial: VendorDraftState = {
    name: saved?.name ?? "",
    email: saved?.email ?? "",
    legal: saved?.legal ?? "",
    country: saved?.country ?? "",
    taxId: saved?.taxId ?? "",
    service: saved?.service ?? "",
    category: saved?.category ?? VENDOR_CATEGORIES[0],
    currencies: saved?.currencies?.length ? saved.currencies : ["USD"],
    banks: saved?.bankAccounts ?? [],
    notes: saved?.notes ?? [],
    projectIds: initialProjects,
    agreements: saved?.agreements ?? [],
  };
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [legal, setLegal] = useState(initial.legal);
  const [country, setCountry] = useState(initial.country);
  const [taxId, setTaxId] = useState(initial.taxId);
  const [service, setService] = useState(initial.service);
  const [category, setCategory] = useState(initial.category);
  const [currencies, setCurrencies] = useState(initial.currencies);
  const [banks, setBanks] = useState<BankAccount[]>(initial.banks);
  const [notes, setNotes] = useState<VendorNote[]>(initial.notes);
  const [projectIds, setProjectIds] = useState(initial.projectIds);
  const [agreements, setAgreements] = useState<VendorAgreement[]>(initial.agreements);
  const [agreement, setAgreement] = useState<{
    projectId: string;
    service: string;
    limit: string;
    currencies: string[];
    invalidLimit: boolean;
    invalidCurrencies: boolean;
  } | null>(null);
  const [savedSnap, setSavedSnap] = useState(() => packDraft(initial));
  const [currencyQuery, setCurrencyQuery] = useState("");
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteMissing, setNoteMissing] = useState<Record<string, string>>({});
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignPick, setAssignPick] = useState<string[]>([]);
  const [assignQuery, setAssignQuery] = useState("");
  const [pickedProject, setPickedProject] = useState<string | null>(null);
  const assignVisible = useMemo(() => {
    const active = session.projects.filter((project) => project.status === "active");
    const selected = active.filter((project) => assignPick.includes(project.id));
    const others = active.filter((project) => !assignPick.includes(project.id));
    if (assignQuery.trim()) {
      const matched = active.filter((project) => projectMatches(project.name, project.code, assignQuery));
      const picked = new Set(assignPick);
      return {
        rows: [...matched.filter((project) => picked.has(project.id)), ...matched.filter((project) => !picked.has(project.id))],
        hidden: 0,
      };
    }
    return {
      rows: [...selected, ...others.slice(0, ASSIGN_OPTIONS)],
      hidden: Math.max(0, others.length - ASSIGN_OPTIONS),
    };
  }, [assignPick, assignQuery, session.projects]);
  const [editing, setEditing] = useState<number | null>(null);
  const [bankForm, setBankForm] = useState({ bank: "", holder: "", country: "", currency: "USD", identifier: "", type: "" });
  const [bankMissing, setBankMissing] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [nameInvalid, setNameInvalid] = useState(false);
  const [creating, setCreating] = useState(false);
  const status: VendorStatus = saved?.status ?? "unregistered";

  const draft = packDraft({ name, email, legal, country, taxId, service, category, currencies, banks, notes, projectIds, agreements });
  const dirty = draft !== savedSnap;
  const currencyMatches = catalog
    .filter((item) => !currencies.includes(item.code))
    .filter((item) => `${item.code} ${item.name}`.toLowerCase().includes(currencyQuery.trim().toLowerCase()))
    .slice(0, 8);

  if (!fresh && !saved) {
    return (
      <>
        <Link href="/proveedores" className="back">
          <ArrowLeft className="icon" /> Ver proveedores
        </Link>
        <h1>Proveedor no encontrado</h1>
      </>
    );
  }

  const approved = saved
    ? approvalAccounts(saved.id, session.invoices, session.human, session.records)
    : [];
  const invoices = saved ? session.invoices.filter((invoice) => invoice.vendorId === saved.id) : [];
  const assignedProjects = session.projects.filter((project) => projectIds.includes(project.id));
  const agreementProject = agreement ? session.projects.find((project) => project.id === agreement.projectId) : undefined;

  function currentDraft(next?: Partial<VendorDraftState>) {
    return packDraft({ name, email, legal, country, taxId, service, category, currencies, banks, notes, projectIds, agreements, ...next });
  }

  function restore(origin: VendorDraftState) {
    setName(origin.name);
    setEmail(origin.email);
    setLegal(origin.legal);
    setCountry(origin.country);
    setTaxId(origin.taxId);
    setService(origin.service);
    setCategory(origin.category);
    setCurrencies(origin.currencies);
    setBanks(origin.banks);
    setNotes(origin.notes);
    setProjectIds(origin.projectIds);
    setAgreements(origin.agreements);
    setNameInvalid(false);
    setError(null);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameInvalid(true);
      setError("Escribe el nombre del proveedor.");
      return;
    }
    if (currencies.length === 0) {
      setError("Añade al menos una moneda.");
      return;
    }
    const card: VendorCard = {
      id: saved?.id ?? `vendor-${crypto.randomUUID().slice(0, 8)}`,
      name: trimmed,
      legal: legal.trim() || trimmed,
      email: email.trim(),
      country: country.trim(),
      taxId: taxId.trim(),
      service: service.trim(),
      category,
      currencies,
      status,
      costCenter: costCenterFor(category),
      bankAccounts: banks,
      notes,
      agreements,
      demoFilled: saved?.demoFilled ?? false,
    };
    session.saveVendorCard(card);
    session.setVendorProjects(card.id, projectIds);
    const next = currentDraft({ name: trimmed, legal: card.legal, email: card.email, country: card.country, taxId: card.taxId ?? "", service: card.service });
    setName(trimmed);
    setSavedSnap(next);
    setError(null);
    setNameInvalid(false);
    if (fresh) router.push(`/proveedores/${card.id}`);
  }

  function openAgreement(projectId: string) {
    const project = session.projects.find((item) => item.id === projectId);
    const existing = agreements.find((item) => item.projectId === projectId);
    const cap = existing?.limitUsd ?? project?.rules.maxAutoApproveUsd ?? session.rules.maxAutoApproveUsd;
    const picked = (existing?.currencies ?? currencies).filter((code) => currencies.includes(code));
    setAgreement({
      projectId,
      service: existing?.service ?? service,
      limit: String(cap),
      currencies: picked.length > 0 ? picked : [...currencies],
      invalidLimit: false,
      invalidCurrencies: false,
    });
  }

  function applyAgreement(event: FormEvent) {
    event.preventDefault();
    if (!agreement) return;
    const limitUsd = Number(agreement.limit.replace(",", "."));
    const invalidLimit = !Number.isFinite(limitUsd) || limitUsd <= 0;
    const invalidCurrencies = agreement.currencies.length === 0;
    if (invalidLimit || invalidCurrencies) {
      setAgreement({ ...agreement, invalidLimit, invalidCurrencies });
      return;
    }
    setAgreements((current) => [
      ...current.filter((item) => item.projectId !== agreement.projectId),
      {
        projectId: agreement.projectId,
        service: agreement.service.trim(),
        limitUsd,
        currencies: [...agreement.currencies].sort(),
      },
    ]);
    setAgreement(null);
  }

  function cancel() {
    if (fresh) {
      router.push("/proveedores");
      return;
    }
    restore(JSON.parse(savedSnap) as VendorDraftState);
  }

  function addCurrency(code: string) {
    setCurrencies((current) => (current.includes(code) ? current : [...current, code]));
    setCurrencyQuery("");
    setCurrencyOpen(false);
    setError(null);
  }

  function openBank(index: number) {
    const current = index >= 0 ? banks[index] : undefined;
    setBankForm({
      bank: current?.bank ?? "",
      holder: current?.holder ?? legal,
      country: current?.country ?? country,
      currency: current?.currency ?? currencies[0] ?? "USD",
      identifier: current?.identifier ?? "",
      type: current?.type ?? "",
    });
    setBankMissing({});
    setEditing(index);
  }

  function saveBank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const account: BankAccount = {
      id: editing !== null && editing >= 0 ? (banks[editing]?.id ?? `bank-${crypto.randomUUID()}`) : `bank-${crypto.randomUUID()}`,
      bank: bankForm.bank.trim(),
      holder: bankForm.holder.trim(),
      country: bankForm.country.trim(),
      currency: bankForm.currency.trim().toUpperCase(),
      identifier: bankForm.identifier.trim(),
      type: bankForm.type.trim() || undefined,
    };
    const missing: Record<string, string> = {};
    if (!account.bank) missing.bank = "Escribe el banco.";
    if (!account.holder) missing.holder = "Escribe el titular.";
    if (!account.country) missing.country = "Escribe el país.";
    if (!/^[A-Z]{3,5}$/.test(account.currency)) missing.currency = "Usa tres letras, por ejemplo USD.";
    if (!account.identifier) missing.identifier = "Escribe el identificador.";
    setBankMissing(missing);
    if (Object.keys(missing).length > 0) return;
    if (banks.some((item, index) => index !== editing && item.identifier === account.identifier)) {
      setBankMissing({ identifier: "Esta cuenta ya está registrada." });
      return;
    }
    setBanks((current) => {
      if (editing === null || editing < 0) return [...current, account];
      return current.map((item, index) => (index === editing ? account : item));
    });
    setEditing(null);
  }

  function addNote(event: FormEvent) {
    event.preventDefault();
    const missing: Record<string, string> = {};
    if (!noteTitle.trim()) missing.title = "Escribe un título.";
    if (!noteBody.trim()) missing.body = "Escribe el comentario.";
    setNoteMissing(missing);
    if (Object.keys(missing).length > 0) return;
    setNotes((current) => [
      ...current,
      {
        id: `note-${crypto.randomUUID()}`,
        title: noteTitle.trim(),
        body: noteBody.trim(),
        at: new Date().toISOString(),
        actor: "Equipo de finanzas",
      },
    ]);
    setNoteTitle("");
    setNoteBody("");
    setNoteMissing({});
    setNoteOpen(false);
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
        <ArrowLeft className="icon" /> Ver proveedores
      </Link>
      <div className="page-heading">
        <div>
          <h1>{fresh ? "Añadir proveedor" : name || saved?.name}</h1>
        </div>
        {fresh ? (
          <button className="btn primary" type="button" disabled={creating} onClick={() => void createVendor()}>
            <Sparkles className="icon" /> {creating ? "Creando…" : "Crear proveedor"}
          </button>
        ) : null}
      </div>
      {creating ? <CreateLoader /> : null}
      {error ? (
        <div className="notice error">
          <p>{error}</p>
        </div>
      ) : null}
      <div className="vendor-grid">
        <div>
        <form id="vendor-form" className="panel" noValidate onSubmit={save}>
          <h2>Datos del proveedor</h2>
          <RequiredNote />
          <div className="vendor-pair">
            <label className={`field${nameInvalid ? " invalid" : ""}`}>
              <span>
                Nombre
                <RequiredMark />
              </span>
              <input
                aria-required="true"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameInvalid(false);
                }}
              />
              {nameInvalid ? <small className="field-error">Escribe el nombre del proveedor.</small> : null}
            </label>
            <label className="field">
              <span>Correo</span>
              <input value={email} inputMode="email" onChange={(event) => setEmail(event.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>Nombre legal</span>
            <input value={legal} onChange={(event) => setLegal(event.target.value)} />
          </label>
          <div className="vendor-pair">
            <label className="field">
              <span>País</span>
              <SearchMenu
                label="País"
                placeholder="Buscar país"
                value={country}
                options={withCurrent(COUNTRIES, country)}
                onChange={setCountry}
              />
            </label>
            <label className="field">
              <span>Identificación fiscal / legal</span>
              <input value={taxId} onChange={(event) => setTaxId(event.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>Servicio habitual</span>
            <textarea rows={3} value={service} onChange={(event) => setService(event.target.value)} />
          </label>
          <label className="field">
            <span>Categoría</span>
            <SelectMenu
              label="Categoría"
              value={category}
              options={VENDOR_CATEGORIES.map((item) => ({ value: item, label: item }))}
              onChange={setCategory}
            />
          </label>
          <div className="field vendor-suggest">
            <span>
              Monedas que acepta
              <RequiredMark />
            </span>
            <input
              value={currencyQuery}
              placeholder="Buscar y añadir moneda"
              aria-expanded={currencyOpen}
              aria-controls="currency-menu"
              onFocus={() => setCurrencyOpen(true)}
              onBlur={() => setCurrencyOpen(false)}
              onChange={(event) => {
                setCurrencyQuery(event.target.value);
                setCurrencyOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                const exact = catalog.find((item) => item.code === currencyQuery.trim().toUpperCase());
                const pick = exact ?? (currencyMatches.length === 1 ? currencyMatches[0] : undefined);
                if (pick) addCurrency(pick.code);
              }}
            />
            {currencyOpen ? (
              <ul id="currency-menu" className="vendor-menu" role="listbox">
                {currencyMatches.length === 0 ? <li><button type="button">No hay monedas con ese nombre.</button></li> : null}
                {currencyMatches.map((item) => (
                  <li key={item.code}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => addCurrency(item.code)}
                    >
                      {item.code} · <small>{item.name}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="vendor-chips">
              {currencies.map((code) => (
                <span key={code} className="vendor-chip">
                  {code}
                  <button type="button" aria-label={`Quitar ${code}`} onClick={() => setCurrencies((current) => current.filter((item) => item !== code))}>
                    <X className="icon" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </form>
        <section className="panel">
          <div className="vendor-head">
            <h2>Notas e historial</h2>
            <button
              className="btn primary"
              type="button"
              onClick={() => {
                setNoteTitle("");
                setNoteBody("");
                setNoteMissing({});
                setNoteOpen(true);
              }}
            >
              <Plus className="icon" /> Añadir nota
            </button>
          </div>
          {notes.length === 0 && approved.length === 0 ? <p className="muted">Las notas de esta ficha aparecerán aquí.</p> : null}
          {[...notes].reverse().map((note) => (
            <article key={note.id} className="vendor-note">
              <strong>
                {note.invoiceId ? <Link href={`/facturas/${note.invoiceId}`}>{note.title}</Link> : note.title}
              </strong>
              <p>{note.body}</p>
              <small>
                {note.actor} · {noteDate(note.at)}
              </small>
            </article>
          ))}
          {approved.map((item) => (
            <article key={`note-${item.invoiceId}`} className="vendor-note">
              <strong>
                <Link href={`/facturas/${item.invoiceId}`}>Cuenta añadida desde {item.invoiceId}</Link>
              </strong>
              <p>{item.line}</p>
            </article>
          ))}
        </section>
        </div>
        <div>
          <section className="panel">
            <div className="vendor-head">
              <h2>Datos bancarios</h2>
              <button className="btn primary" type="button" onClick={() => openBank(-1)}>
                <Plus className="icon" /> Añadir cuenta
              </button>
            </div>
            {banks.length === 0 ? <p className="muted">Todavía no hay cuentas registradas.</p> : null}
            {banks.map((account, index) => (
              <div key={account.id} className="vendor-bank">
                <strong>
                  {account.bank} · {maskAccount(account.identifier)}
                </strong>
                <p>
                  {account.holder} · {account.currency}
                </p>
                <div className="button-row">
                  <button className="text-btn" type="button" onClick={() => openBank(index)}>
                    Editar cuenta
                  </button>
                  <button className="text-btn vendor-remove" type="button" onClick={() => setBanks((current) => current.filter((item) => item.id !== account.id))}>
                    Quitar
                  </button>
                </div>
              </div>
            ))}
            {approved.map((item) => (
              <div key={item.invoiceId} className="vendor-bank">
                <strong>Cuenta añadida al aprobar · {item.invoiceId}</strong>
                <p>{item.line}. La cuenta anterior se conserva.</p>
              </div>
            ))}
          </section>
          <section className="panel">
            <div className="vendor-head">
              <h2>
                Proyectos <span className="vendor-count">{assignedProjects.length}</span>
              </h2>
              <button
                className="btn vendor-pill"
                type="button"
                onClick={() => {
                  setAssignPick(projectIds);
                  setAssignQuery("");
                  setAssignOpen(true);
                }}
              >
                Asignar proyectos
              </button>
            </div>
            {assignedProjects.length === 0 ? <p className="muted">Este proveedor no está asignado a un proyecto.</p> : null}
            {assignedProjects.map((project) => {
              const savedAgreement = agreements.find((item) => item.projectId === project.id);
              const cap = savedAgreement?.limitUsd ?? project.rules.maxAutoApproveUsd ?? session.rules.maxAutoApproveUsd;
              const money = (savedAgreement?.currencies ?? currencies).filter((code) => currencies.includes(code));
              const selected = pickedProject === project.id;
              return (
                <div
                  key={project.id}
                  className={`vendor-project${selected ? " is-selected" : ""}`}
                  aria-selected={selected}
                  onClick={() => {
                    setPickedProject(project.id);
                    openAgreement(project.id);
                  }}
                >
                  <div className="vendor-project-copy">
                    <strong>{project.name}</strong>
                    <small>Lista {project.code}</small>
                    <small>
                      Hasta {usd(cap)} USD · {money.length > 0 ? money.join(", ") : "USD"}
                    </small>
                  </div>
                  <button
                    className="iv-detail vendor-agree"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPickedProject(project.id);
                      openAgreement(project.id);
                    }}
                  >
                    Ver acuerdo <ArrowRight className="icon" />
                  </button>
                </div>
              );
            })}
            <p className="vendor-footnote">Cada proyecto conserva su propio servicio, límite y monedas.</p>
          </section>
          {fresh ? null : (
            <section className="panel">
              <div className="vendor-head">
                <h2>Facturas</h2>
              </div>
              {invoices.length === 0 ? <p className="muted">Este proveedor no tiene facturas en la sesión.</p> : null}
              {invoices.map((invoice) => {
                const record = session.records.find((item) => item.invoiceId === invoice.id);
                const invoiceStatus = record ? session.statusOf(record) : null;
                const figure = invoice.currency === "USD" ? `${usd(invoice.totalPayable)} USD` : amount(invoice.totalPayable, invoice.currency);
                return (
                  <div key={invoice.id} className="vendor-invoice">
                    <Link href={`/facturas/${invoice.id}`}>
                      {invoice.id} · {figure}
                    </Link>
                    {invoiceStatus ? <span className={statusClass(invoiceStatus)}>{statusLabel(invoiceStatus)}</span> : null}
                  </div>
                );
              })}
            </section>
          )}
        </div>
      </div>
      <div className="vendor-savebar">
        <span>{dirty ? "Hay cambios sin guardar." : "Sin cambios pendientes"}</span>
        <div className="button-row">
          <button className="btn" type="button" onClick={cancel}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" form="vendor-form" disabled={!dirty}>
            Guardar cambios
          </button>
        </div>
      </div>
      <Dialog open={noteOpen} title="Añadir nota" onClose={() => setNoteOpen(false)} className="id-modal">
        <form noValidate onSubmit={addNote}>
          <RequiredNote />
          <label className={`field${noteMissing.title ? " invalid" : ""}`}>
            <span>
              Título
              <RequiredMark />
            </span>
            <input
              aria-required="true"
              value={noteTitle}
              placeholder="Ej.: Cuenta confirmada"
              onChange={(event) => {
                setNoteTitle(event.target.value);
                setNoteMissing((current) => ({ ...current, title: "" }));
              }}
            />
            {noteMissing.title ? <small className="field-error">{noteMissing.title}</small> : null}
          </label>
          <label className={`field${noteMissing.body ? " invalid" : ""}`}>
            <span>
              Comentario
              <RequiredMark />
            </span>
            <textarea
              aria-required="true"
              rows={4}
              maxLength={600}
              value={noteBody}
              placeholder="Escribe el contexto que quieres conservar"
              onChange={(event) => {
                setNoteBody(event.target.value);
                setNoteMissing((current) => ({ ...current, body: "" }));
              }}
            />
            {noteMissing.body ? <small className="field-error">{noteMissing.body}</small> : null}
          </label>
          <p>La nota se guardará junto con los cambios de la ficha.</p>
          <div className="button-row">
            <button className="btn" type="button" onClick={() => setNoteOpen(false)}>
              Cancelar
            </button>
            <button className="btn primary" type="submit">
              Añadir al borrador
            </button>
          </div>
        </form>
      </Dialog>
      <Dialog open={assignOpen} title="Asignar proyectos" onClose={() => setAssignOpen(false)} className="id-modal">
        <p>Puedes seleccionar varios proyectos. Cada uno tendrá un acuerdo independiente.</p>
        <label className="plist-search assign-search">
          <Search className="icon" />
          <span className="visually-hidden">Buscar proyecto</span>
          <input
            type="search"
            value={assignQuery}
            placeholder="Buscar proyecto"
            onChange={(event) => setAssignQuery(event.target.value)}
          />
        </label>
        <div className="assign-list">
          {assignVisible.rows.map((project) => (
            <label key={project.id} className="pp-choice">
              <input
                type="checkbox"
                checked={assignPick.includes(project.id)}
                onChange={() =>
                  setAssignPick((current) =>
                    current.includes(project.id) ? current.filter((item) => item !== project.id) : [...current, project.id],
                  )
                }
              />
              <span>
                <strong>{project.name}</strong>
                <small>Lista {project.code}</small>
              </span>
            </label>
          ))}
          {assignVisible.rows.length === 0 ? <p className="assign-empty">No hay proyectos con ese nombre.</p> : null}
        </div>
        {assignVisible.hidden > 0 ? (
          <p className="assign-more">Hay {assignVisible.hidden} proyectos más. Búscalos por nombre o por lista.</p>
        ) : null}
        <p className="id-callout">Desmarcar un proyecto retira la asignación para nuevos pagos; no elimina facturas ni historial.</p>
        <div className="button-row">
          <button className="btn" type="button" onClick={() => setAssignOpen(false)}>
            Cancelar
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              setProjectIds(assignPick);
              setAssignOpen(false);
            }}
          >
            Aplicar selección
          </button>
        </div>
      </Dialog>
      <Dialog open={agreement !== null} title={agreementProject?.name ?? "Acuerdo"} onClose={() => setAgreement(null)} className="id-modal">
        {agreement && agreementProject ? (
          <form className="agree-form" noValidate onSubmit={applyAgreement}>
            <p className="agree-list">Lista {agreementProject.code}</p>
            <RequiredNote />
            <label className="field">
              <span>Servicio acordado</span>
              <textarea rows={3} value={agreement.service} onChange={(event) => setAgreement({ ...agreement, service: event.target.value })} />
            </label>
            <label className={`field${agreement.invalidLimit ? " invalid" : ""}`}>
              <span>
                Límite por factura (USD)
                <RequiredMark />
              </span>
              <input
                aria-required="true"
                inputMode="decimal"
                value={agreement.limit}
                onChange={(event) => setAgreement({ ...agreement, limit: event.target.value, invalidLimit: false })}
              />
              {agreement.invalidLimit ? <small className="field-error">Escribe un límite mayor que cero.</small> : null}
            </label>
            <fieldset className={`agree-money${agreement.invalidCurrencies ? " invalid" : ""}`}>
              <legend>
                Monedas del acuerdo
                <RequiredMark />
              </legend>
              <div>
                {currencies.map((code) => (
                  <label key={code}>
                    <input
                      type="checkbox"
                      checked={agreement.currencies.includes(code)}
                      onChange={() =>
                        setAgreement({
                          ...agreement,
                          invalidCurrencies: false,
                          currencies: agreement.currencies.includes(code)
                            ? agreement.currencies.filter((item) => item !== code)
                            : [...agreement.currencies, code],
                        })
                      }
                    />
                    {code}
                  </label>
                ))}
              </div>
              {agreement.invalidCurrencies ? <small className="field-error">Elige al menos una moneda.</small> : null}
            </fieldset>
            <p className="id-callout">Estos cambios solo afectan al acuerdo de {agreementProject.name}.</p>
            <div className="button-row">
              <button className="btn" type="button" onClick={() => setAgreement(null)}>
                Cancelar
              </button>
              <button className="btn primary" type="submit">
                Aplicar al borrador
              </button>
            </div>
          </form>
        ) : null}
      </Dialog>
      <Dialog
        open={editing !== null}
        title={editing !== null && editing < 0 ? "Añadir cuenta" : "Editar cuenta"}
        onClose={() => setEditing(null)}
        className="id-modal"
      >
        <form noValidate onSubmit={saveBank}>
          <RequiredNote />
          {(
            [
              ["bank", "Banco", bankForm.bank],
              ["holder", "Titular", bankForm.holder],
            ] as const
          ).map(([key, label, value]) => (
            <label key={key} className={`field${bankMissing[key] ? " invalid" : ""}`}>
              <span>
                {label}
                <RequiredMark />
              </span>
              <input
                aria-required="true"
                value={value}
                onChange={(event) => {
                  setBankForm((current) => ({ ...current, [key]: event.target.value }));
                  setBankMissing((current) => ({ ...current, [key]: "" }));
                }}
              />
              {bankMissing[key] ? <small className="field-error">{bankMissing[key]}</small> : null}
            </label>
          ))}
          <label className={`field${bankMissing.country ? " invalid" : ""}`}>
            <span>
              País
              <RequiredMark />
            </span>
            <SearchMenu
              required
              label="País"
              placeholder="Buscar país"
              className="opens-up"
              value={bankForm.country}
              options={COUNTRIES.map((item) => ({ value: item, label: item }))}
              onChange={(country) => {
                setBankForm((current) => ({ ...current, country }));
                setBankMissing((current) => ({ ...current, country: "" }));
              }}
            />
            {bankMissing.country ? <small className="field-error">{bankMissing.country}</small> : null}
          </label>
          <label className={`field${bankMissing.currency ? " invalid" : ""}`}>
            <span>
              Moneda
              <RequiredMark />
            </span>
            <SearchMenu
              required
              label="Moneda"
              placeholder="Buscar moneda"
              className="opens-up"
              value={bankForm.currency}
              options={currencyChoices().map((choice) => ({ value: choice.code, label: `${choice.code} · ${choice.name}` }))}
              onChange={(currency) => {
                setBankForm((current) => ({ ...current, currency }));
                setBankMissing((current) => ({ ...current, currency: "" }));
              }}
            />
            {bankMissing.currency ? <small className="field-error">{bankMissing.currency}</small> : null}
          </label>
          {(
            [["identifier", "Identificador", bankForm.identifier, true]] as const
          ).map(([key, label, value, required]) => (
            <label key={key} className={`field${bankMissing[key] ? " invalid" : ""}`}>
              <span>
                {label}
                {required ? <RequiredMark /> : null}
              </span>
              <input
                aria-required={required || undefined}
                value={value}
                onChange={(event) => {
                  setBankForm((current) => ({ ...current, [key]: event.target.value }));
                  setBankMissing((current) => ({ ...current, [key]: "" }));
                }}
              />
              {bankMissing[key] ? <small className="field-error">{bankMissing[key]}</small> : null}
            </label>
          ))}
          <label className="field">
            <span>Tipo de cuenta</span>
            <SelectMenu
              label="Tipo de cuenta"
              placeholder="Elige un tipo"
              value={bankForm.type}
              options={withCurrent(ACCOUNT_TYPES, bankForm.type)}
              onChange={(type) => setBankForm((current) => ({ ...current, type }))}
            />
          </label>
          <p>La cuenta queda en el borrador hasta que guardes la ficha.</p>
          <div className="button-row">
            <button className="btn" type="button" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button className="btn primary" type="submit">
              {editing !== null && editing < 0 ? "Añadir al borrador" : "Guardar en el borrador"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
