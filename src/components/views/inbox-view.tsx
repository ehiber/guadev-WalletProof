"use client";

import { BudgetMeter, purse } from "@/components/budget-meter";
import { INVOICE_FILE_ACCEPT, useSession } from "@/components/session/session-provider";
import { SelectMenu } from "@/components/ui/select-menu";
import { amount, originLabel, statusClass, statusLabel, vendorDisplay } from "@/lib/format";
import { MAX_INVOICES } from "@/lib/invoice-limits";
import { ALL_PROJECTS } from "@/lib/mock-data/projects";
import { inPeriod, parsePeriod } from "@/lib/stats/metrics";
import type { AuditRecord, DecisionStatus, Invoice } from "@/types/blinka";
import { ArrowRight, ChevronLeft, ChevronRight, Download, ExternalLink, FolderOpen, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const FILTERS: Array<{ id: "ALL" | DecisionStatus; label: string }> = [
  { id: "ALL", label: "Todas" },
  { id: "ESCALATED", label: "Por revisar" },
  { id: "APPROVED", label: "Pagado" },
  { id: "BLOCKED", label: "Rechazado" },
];

const PAGE_OPTIONS = [5, 10, 20];
const TEST_INVOICES_DRIVE_URL = "https://drive.google.com/drive/folders/14X19nMt0gcoY0l1_CGW7yTimpAb3aNXe?usp=sharing";

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
  })
    .format(date)
    .replace(/[\u00A0\u202F]/g, " ");
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

export function InboxView() {
  const session = useSession();
  const router = useRouter();
  const [filter, setFilter] = useState<"ALL" | DecisionStatus>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_OPTIONS[0]);
  const params = useSearchParams();
  const estado = params.get("estado");
  const alcance = params.get("alcance");
  const proyecto = params.get("proyecto");
  const periodo = params.get("periodo");
  useEffect(() => {
    if (proyecto && proyecto !== "all" && session.projects.some((item) => item.id === proyecto)) {
      session.setActiveProjectId(proyecto);
    } else if (alcance === "todos" || proyecto === "all") {
      session.setActiveProjectId(ALL_PROJECTS);
    }
    if (estado === "revision") setFilter("ESCALATED");
    else if (estado === "pagado") setFilter("APPROVED");
    else if (estado === "rechazado") setFilter("BLOCKED");
    else if (alcance === "todos" || proyecto) setFilter("ALL");
    if (estado || alcance || proyecto) setPage(0);
  }, [alcance, estado, proyecto, session.projects, session.setActiveProjectId]);
  const project = session.projects.find((item) => item.id === session.activeProjectId);
  const showAll = session.activeProjectId === ALL_PROJECTS;
  const scoped = useMemo(() => {
    const period = periodo === "7" || periodo === "30" || periodo === "90" ? parsePeriod(periodo) : null;
    return session.invoices.filter((invoice) => {
      if (!showAll && invoice.projectId !== session.activeProjectId) return false;
      return period ? inPeriod(invoice.receivedAt, period) : true;
    });
  }, [periodo, session.activeProjectId, session.invoices, showAll]);
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

  const fileInput = useRef<HTMLInputElement>(null);
  const [batchNote, setBatchNote] = useState<string | null>(null);

  function chooseFilter(next: "ALL" | DecisionStatus) {
    setFilter(next);
    setPage(0);
  }

  async function onFiles(files: File[]) {
    if (files.length === 0) return;
    setBatchNote(null);
    const result = await session.uploadMany(files);
    if (result.added.length > 0 && result.failed.length === 0 && result.skipped.length === 0) {
      setBatchNote(
        result.added.length === 1 ? "Se procesó 1 factura." : `Se procesaron ${result.added.length} facturas.`,
      );
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Facturas</h1>
          <p>Recibe, revisa y sigue cada decisión.</p>
        </div>
        <div className="heading-actions">
          <button className="btn primary" type="button" disabled={session.running} onClick={() => fileInput.current?.click()}>
            <Plus className="icon" /> {session.running ? "Leyendo facturas…" : "Añadir factura"}
          </button>
          <input
            ref={fileInput}
            className="visually-hidden"
            type="file"
            multiple
            accept={INVOICE_FILE_ACCEPT}
            aria-label="Seleccionar facturas en PDF, JPG, PNG, WEBP o GIF"
            onChange={(event) => {
              const selected = [...(event.target.files ?? [])];
              event.target.value = "";
              void onFiles(selected);
            }}
          />
          <button className="btn" type="button" onClick={() => session.exportCsv(ordered.map((invoice) => invoice.id))}>
            <Download className="icon" /> Exportar CSV
          </button>
        </div>
      </div>
      <section className="callout invoice-playground" aria-labelledby="test-invoices-title">
        <span className="callout-icon" aria-hidden="true">
          <FolderOpen className="icon" />
        </span>
        <div>
          <strong id="test-invoices-title">Facturas de prueba</strong>
          <p>Explora el dataset sintético del reto, descarga una factura y usa “Añadir factura” para que Wallet Proof la lea, decida y explique el resultado.</p>
          <small>
            Incluye facturas que pueden aprobarse, enviarse a revisión o bloquearse. Puedes tener hasta {MAX_INVOICES} facturas;
            cada archivo debe pesar menos de 4 MB.
          </small>
        </div>
        <a className="btn" href={TEST_INVOICES_DRIVE_URL} target="_blank" rel="noreferrer">
          Abrir dataset <ExternalLink className="icon" />
        </a>
      </section>
      {session.uploadStatus ? (
        <div className="notice" role="status">
          <p>{session.uploadStatus}</p>
        </div>
      ) : null}
      {session.liveError ? (
        <div className="notice error">
          <p>{session.liveError}</p>
        </div>
      ) : null}
      {batchNote && !session.running && !session.liveError ? (
        <div className="notice" role="status">
          <p>{batchNote}</p>
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
          <SelectMenu
            label="Proyecto"
            value={session.activeProjectId}
            options={[
              ...session.projects
                .filter((item) => item.status === "active")
                .map((item) => ({ value: item.id, label: item.name })),
              { value: ALL_PROJECTS, label: "Todos los proyectos" },
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
                              <Link
                                className="iv-project"
                                href={`/proyectos/${rowProject.id}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  session.rememberProject(rowProject.id);
                                  session.setActiveProjectId(rowProject.id);
                                }}
                              >
                                {rowProject.name}
                              </Link>
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
                              {amount(invoice.totalPayable, invoice.currency)}
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
                  <SelectMenu
                    className="fit opens-up"
                    label="Facturas por página"
                    value={String(size)}
                    options={sizeOptions.map((option) => ({ value: String(option), label: `${option} por página` }))}
                    onChange={(next) => {
                      setPageSize(Number(next));
                      setPage(0);
                    }}
                  />
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
