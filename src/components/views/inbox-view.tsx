"use client";

import { useSession } from "@/components/session/session-provider";
import { originLabel, statusClass, statusLabel, usd, vendorDisplay } from "@/lib/format";
import { ALL_PROJECTS } from "@/lib/mock-data/projects";
import type { AuditRecord, DecisionStatus, Invoice } from "@/types/blinka";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Download, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const FILTERS: Array<{ id: "ALL" | DecisionStatus; label: string }> = [
  { id: "ALL", label: "Todas" },
  { id: "ESCALATED", label: "Por revisar" },
  { id: "APPROVED", label: "Pagado" },
  { id: "BLOCKED", label: "Rechazado" },
];

const PAGE_OPTIONS = [5, 10, 20];

function pageSizeOptions(total: number) {
  return PAGE_OPTIONS.filter((size, index) => total > (index === 0 ? 0 : PAGE_OPTIONS[index - 1]));
}

function enteredLabel(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function purse(paid: number, retained: number, total: number) {
  const base = total > 0 ? total : 1;
  let paidPct = (paid / base) * 100;
  let retainedPct = (retained / base) * 100;
  if (paidPct + retainedPct > 100) {
    const scale = 100 / (paidPct + retainedPct);
    paidPct *= scale;
    retainedPct *= scale;
  }
  return {
    paid,
    retained,
    total,
    available: Math.max(0, Number((total - paid - retained).toFixed(2))),
    paidPct,
    retainedPct,
  };
}

function documentAmount(value: number): string {
  return new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function motive(record: AuditRecord): string {
  if (record.finalStatus === "APPROVED") return "Cumple los criterios de la empresa y del proyecto.";
  const reason = record.hardRulesResult.reasons[0];
  if (reason) return reason;
  if (record.jevResult?.socialEngineeringRisk.score === "HIGH") return "La cuenta de pago es distinta de la registrada.";
  if (record.jevResult && !record.jevResult.contractCoherence.answer) return "El concepto no coincide con el servicio acordado.";
  if (record.jevResult?.semanticDuplicate.answer) return "El concepto se parece a una factura ya registrada.";
  return "Requiere una decisión de una persona.";
}

function ProjectSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.id === value);
  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="invoice-select" ref={root}>
      <button type="button" aria-label="Proyecto" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((currentOpen) => !currentOpen)}>
        <span>{current?.label}</span>
        <ChevronDown className="icon" aria-hidden="true" />
      </button>
      {open ? (
        <ul role="listbox" aria-label="Proyecto">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                aria-selected={option.id === value}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
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

function BudgetMeter({
  label,
  paid,
  retained,
  total,
  available,
  paidPct,
  retainedPct,
}: {
  label: string;
  paid: number;
  retained: number;
  total: number;
  available: number;
  paidPct: number;
  retainedPct: number;
}) {
  return (
    <div className="budget-block">
      <div className="budget-head">
        <span>{label}</span>
        <strong>
          {usd(available)} <span className="small">USD</span>
        </strong>
      </div>
      <div
        className="budget-bar"
        role="img"
        aria-label={`Presupuesto ${usd(total)}, pagado ${usd(paid)}, retenido ${usd(retained)}, disponible ${usd(available)}`}
      >
        <span className="budget-approved" style={{ width: `${paidPct}%` }} />
        <span className="budget-retained" style={{ width: `${retainedPct}%` }} />
      </div>
      <div className="budget-legend">
        <span>
          <i className="budget-dot paid" aria-hidden="true" /> Pagado {usd(paid)}
        </span>
        <span>
          <i className="budget-dot retained" aria-hidden="true" /> Retenido {usd(retained)}
        </span>
        <span className="budget-total">Total {usd(total)}</span>
      </div>
      <p className="budget-note">Lo retenido está reservado para facturas por revisar.</p>
    </div>
  );
}

export function InboxView() {
  const session = useSession();
  const router = useRouter();
  const [filter, setFilter] = useState<"ALL" | DecisionStatus>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_OPTIONS[0]);
  const project = session.projects.find((item) => item.id === session.activeProjectId);
  const showAll = session.activeProjectId === ALL_PROJECTS;
  const scoped = useMemo(
    () => session.invoices.filter((invoice) => showAll || invoice.projectId === session.activeProjectId),
    [session.activeProjectId, session.invoices, showAll],
  );
  const counts = useMemo(() => {
    const tally = { ALL: scoped.length, APPROVED: 0, ESCALATED: 0, BLOCKED: 0 };
    for (const invoice of scoped) {
      const record = session.records.find((item) => item.invoiceId === invoice.id);
      if (record) tally[session.statusOf(record)] += 1;
    }
    return tally;
  }, [scoped, session]);
  const ordered = scoped
    .map((invoice, index) => ({ invoice, index }))
    .filter(({ invoice }) => {
      const record = session.records.find((item) => item.invoiceId === invoice.id);
      if (!record) return false;
      const matchesFilter = filter === "ALL" || session.statusOf(record) === filter;
      const projectName = session.projects.find((item) => item.id === invoice.projectId)?.name ?? "";
      const haystack = `${vendorDisplay(invoice.vendorId, invoice.vendorName)} ${invoice.id} ${invoice.invoiceNumber} ${projectName}`.toLowerCase();
      return matchesFilter && haystack.includes(query.trim().toLowerCase());
    })
    .sort((a, b) => {
      const left = a.invoice.receivedAt ?? "";
      const right = b.invoice.receivedAt ?? "";
      if (left !== right) return right.localeCompare(left);
      return b.index - a.index;
    })
    .map(({ invoice }) => invoice);
  const sizeOptions = pageSizeOptions(ordered.length);
  const size = sizeOptions.includes(pageSize) ? pageSize : (sizeOptions[sizeOptions.length - 1] ?? PAGE_OPTIONS[0]);
  const pageCount = Math.max(1, Math.ceil(ordered.length / size));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = ordered.slice(currentPage * size, currentPage * size + size);
  const rangeStart = ordered.length === 0 ? 0 : currentPage * size + 1;
  const rangeEnd = Math.min(ordered.length, (currentPage + 1) * size);
  const sumStatus = (invoices: Invoice[], status: DecisionStatus) =>
    invoices.reduce((sum, invoice) => {
      const record = session.records.find((item) => item.invoiceId === invoice.id);
      return sum + (record && session.statusOf(record) === status ? record.totalPayableUsd : 0);
    }, 0);
  const currentPurse = purse(
    sumStatus(scoped, "APPROVED"),
    sumStatus(scoped, "ESCALATED"),
    project?.rules.monthlyBudgetUsd ?? session.rules.monthlyBudgetUsd,
  );

  function chooseFilter(next: "ALL" | DecisionStatus) {
    setFilter(next);
    setPage(0);
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Facturas</h1>
          <p>Recibe, revisa y sigue cada decisión.</p>
        </div>
        <div className="heading-actions">
          <Link className="btn primary" href="/facturas/nueva">
            <Plus className="icon" /> Añadir factura
          </Link>
          <button className="btn" type="button" onClick={() => session.exportCsv(ordered.map((invoice) => invoice.id))}>
            <Download className="icon" /> Exportar CSV
          </button>
        </div>
      </div>
      {session.liveError ? (
        <div className="notice error">
          <p>{session.liveError}</p>
        </div>
      ) : null}
      <div className="invoice-filters">
        <div className="invoice-tabs" role="tablist" aria-label="Filtrar por decisión">
          {FILTERS.map((item) => {
            const count = item.id === "ALL" ? counts.ALL : counts[item.id];
            return (
              <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => chooseFilter(item.id)}>
                {item.label}
                <span className={item.id === "ESCALATED" ? "count attention" : "count"}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="invoice-tools">
          <ProjectSelect
            value={session.activeProjectId}
            options={[
              ...session.projects
                .filter((item) => item.status === "active")
                .map((item) => ({ id: item.id, label: item.name })),
              { id: ALL_PROJECTS, label: "Todos los proyectos" },
            ]}
            onChange={(id) => {
              session.setActiveProjectId(id);
              setPage(0);
            }}
          />
          <label className="invoice-search">
            <Search className="icon" />
            <span className="visually-hidden">Buscar factura o proveedor</span>
            <input
              type="search"
              value={query}
              placeholder="Buscar factura o proveedor"
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </label>
        </div>
      </div>
      {showAll ? null : (
        <div className="invoice-budget">
          <BudgetMeter label={`Disponible de ${project?.name ?? "este proyecto"}`} {...currentPurse} />
        </div>
      )}
      <section className={showAll ? "table-card iv-table-gap" : "table-card"} aria-label="Facturas">
        {ordered.length === 0 ? (
          <div className="empty">
            <h3>{scoped.length === 0 ? "Este proyecto todavía no tiene facturas" : "Sin resultados"}</h3>
            <p>
              {scoped.length === 0
                ? "Las que agregues aquí se evalúan con las reglas de la empresa y las diferencias de este proyecto."
                : "Ninguna factura coincide con este filtro."}
            </p>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className={showAll ? "iv-table cols-6" : "iv-table"}>
                <thead>
                  <tr>
                    <th scope="col">Factura / proveedor</th>
                    {showAll ? <th scope="col">Proyecto</th> : null}
                    <th scope="col">Ingresó</th>
                    <th scope="col">Importe</th>
                    <th scope="col">Estado y motivo</th>
                    <th scope="col">
                      <span className="visually-hidden">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((invoice) => {
                    const record = session.records.find((item) => item.invoiceId === invoice.id)!;
                    const status = session.statusOf(record);
                    const rowProject = session.projects.find((item) => item.id === invoice.projectId);
                    return (
                      <tr key={invoice.id} className="iv-row" onClick={() => router.push(`/facturas/${invoice.id}`)}>
                        <td>
                          <Link className="iv-id" href={`/facturas/${invoice.id}`} onClick={(event) => event.stopPropagation()}>
                            {invoice.id}
                          </Link>
                          <span className="iv-vendor">{vendorDisplay(invoice.vendorId, invoice.vendorName)}</span>
                          <span className="iv-meta">{originLabel(invoice)}</span>
                        </td>
                        {showAll ? (
                          <td>
                            {rowProject ? (
                              <button
                                className="iv-project"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  session.setActiveProjectId(rowProject.id);
                                  setPage(0);
                                }}
                              >
                                {rowProject.name}
                              </button>
                            ) : (
                              <span className="iv-unassigned">Sin proyecto</span>
                            )}
                          </td>
                        ) : null}
                        <td className="iv-entered">{enteredLabel(invoice.receivedAt)}</td>
                        <td className="iv-amount">
                          <strong>
                            {invoice.currency === "USD" || record.hardRulesResult.fxValid ? (
                              <>
                                {documentAmount(invoice.currency === "USD" ? invoice.totalPayable : record.totalPayableUsd)} <span>USD</span>
                              </>
                            ) : (
                              "Sin tasa del día"
                            )}
                          </strong>
                          {invoice.currency !== "USD" ? (
                            <small>
                              {documentAmount(invoice.totalPayable)} {invoice.currency}
                            </small>
                          ) : null}
                        </td>
                        <td>
                          <span className={statusClass(status)}>{statusLabel(status)}</span>
                          <p className="iv-reason">{motive(record)}</p>
                        </td>
                        <td>
                          <Link className="iv-detail" href={`/facturas/${invoice.id}`} onClick={(event) => event.stopPropagation()}>
                            Ver detalle <ArrowRight className="icon" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-footer iv-pager">
              <span>
                {rangeStart}–{rangeEnd} de {ordered.length}
              </span>
              <div className="iv-pager-actions">
                {sizeOptions.length > 1 ? (
                  <label className="iv-page-size">
                    <span className="visually-hidden">Facturas por página</span>
                    <select
                      value={size}
                      onChange={(event) => {
                        setPageSize(Number(event.target.value));
                        setPage(0);
                      }}
                    >
                      {sizeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option} por página
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <div className="iv-pages" role="navigation" aria-label="Páginas de facturas">
                <button type="button" aria-label="Página anterior" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                  <ChevronLeft className="icon" />
                </button>
                {Array.from({ length: pageCount }, (_, index) => (
                  <button key={index} type="button" aria-current={index === currentPage ? "page" : undefined} onClick={() => setPage(index)}>
                    {index + 1}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Página siguiente"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRight className="icon" />
                </button>
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
