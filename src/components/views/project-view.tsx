"use client";

import { BudgetMeter, purse } from "@/components/budget-meter";
import { useSession } from "@/components/session/session-provider";
import { Dialog, RequiredMark, RequiredNote } from "@/components/ui/ui";
import { budgetMonthLabel, usd, vendorDisplay } from "@/lib/format";
import type { VendorCard } from "@/lib/vendors/directory";
import { ArrowLeft, ArrowRight, LayoutGrid, Plus, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useEffect, useState, type CSSProperties, type FormEvent } from "react";

const VENDOR_RESULT_LIMIT = 8;

type AgreementDraft = {
  vendorId: string;
  service: string;
  limit: string;
  currencies: string[];
  invalidLimit: boolean;
  invalidCurrencies: boolean;
};

export function ProjectView({ id }: { id: string }) {
  const session = useSession();
  const project = session.projects.find((item) => item.id === id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [agreement, setAgreement] = useState<AgreementDraft | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!project) return;
    session.rememberProject(project.id);
    session.setActiveProjectId(project.id);
  }, [project, session.rememberProject, session.setActiveProjectId]);

  if (!project) {
    return (
      <>
        <h1>Proyecto no encontrado</h1>
        <p>Ese proyecto no está en esta sesión.</p>
        <Link className="btn" href="/proyectos">
          Ver proyectos
        </Link>
      </>
    );
  }

  // Capture the narrowed project for event handlers, which can run after render.
  const projectId = project.id;
  const projectRules = project.rules;
  const projectCurrencies = project.currencies ?? [];

  const invoices = session.invoices.filter((invoice) => invoice.projectId === project.id);
  const review = invoices.filter((invoice) => {
    const record = session.records.find((item) => item.invoiceId === invoice.id);
    return record ? session.statusOf(record) === "ESCALATED" : false;
  }).length;
  const sumStatus = (status: "APPROVED" | "ESCALATED") =>
    invoices.reduce((sum, invoice) => {
      const record = session.records.find((item) => item.invoiceId === invoice.id);
      return sum + (record && session.statusOf(record) === status ? record.totalPayableUsd : 0);
    }, 0);
  const budget = purse(sumStatus("APPROVED"), sumStatus("ESCALATED"), project.rules.monthlyBudgetUsd ?? session.rules.monthlyBudgetUsd);
  const paid = invoices.filter((invoice) => {
    const record = session.records.find((item) => item.invoiceId === invoice.id);
    return record ? session.statusOf(record) === "APPROVED" : false;
  }).length;
  const generalCriteria = session.rules.criteria.filter((item) => item.enabled).length;
  const projectCriteria = Object.values(project.rules.criteria ?? {}).filter((item) => item.enabled !== false).length;
  const month = budgetMonthLabel(project.budgetMonth);
  const currencies = project.currencies ?? [];
  const assigned = project.vendorIds
    .map((vendorId) => session.vendorCards.find((card) => card.id === vendorId))
    .filter((card) => card != null);
  const available = session.vendorCards.filter((card) => !project.vendorIds.includes(card.id));
  const needle = deferredQuery.trim().toLowerCase();
  const matches = available.filter((card) => {
    const haystack = `${card.name} ${card.legal} ${card.category} ${card.country}`.toLowerCase();
    return haystack.includes(needle);
  });
  const visibleMatches = matches.slice(0, VENDOR_RESULT_LIMIT);

  function openPicker() {
    setQuery("");
    setPicked(null);
    setPickerOpen(true);
  }

  function addPicked() {
    if (!picked) return;
    session.addVendorToProject(projectId, picked);
    setPickerOpen(false);
  }

  function openAgreement(card: VendorCard) {
    const existing = card.agreements?.find((item) => item.projectId === projectId);
    const cap = existing?.limitUsd ?? projectRules.maxAutoApproveUsd ?? session.rules.maxAutoApproveUsd;
    const catalog = card.currencies.length > 0 ? card.currencies : projectCurrencies;
    const pickedCurrencies = (existing?.currencies ?? catalog).filter((code) => catalog.includes(code));
    setAgreement({
      vendorId: card.id,
      service: existing?.service ?? card.service,
      limit: String(cap),
      currencies: pickedCurrencies.length > 0 ? pickedCurrencies : [...catalog],
      invalidLimit: false,
      invalidCurrencies: false,
    });
  }

  function saveAgreement(event: FormEvent) {
    event.preventDefault();
    if (!agreement) return;
    const card = session.vendorCards.find((item) => item.id === agreement.vendorId);
    if (!card) return;
    const limitUsd = Number(agreement.limit.replace(",", "."));
    const invalidLimit = !Number.isFinite(limitUsd) || limitUsd <= 0;
    const invalidCurrencies = agreement.currencies.length === 0;
    if (invalidLimit || invalidCurrencies) {
      setAgreement({ ...agreement, invalidLimit, invalidCurrencies });
      return;
    }
    session.saveVendorCard({
      ...card,
      agreements: [
        ...(card.agreements ?? []).filter((item) => item.projectId !== projectId),
        {
          projectId,
          service: agreement.service.trim(),
          limitUsd,
          currencies: [...agreement.currencies].sort(),
        },
      ],
    });
    setAgreement(null);
  }

  const agreementCard = agreement ? session.vendorCards.find((item) => item.id === agreement.vendorId) : undefined;
  const agreementCurrencies = agreementCard
    ? agreementCard.currencies.length > 0
      ? agreementCard.currencies
      : (project.currencies ?? [])
    : [];

  const active = project.status === "active";

  return (
    <>
      <Link className="back" href="/proyectos">
        <ArrowLeft className="icon" /> Todos los proyectos
      </Link>
      <div className="page-heading">
        <div>
          <h1>{project.name}</h1>
          {project.description ? <p>{project.description}</p> : null}
        </div>
        <Link className="btn" href="/reglas" onClick={() => session.setActiveProjectId(project.id)}>
          <SlidersHorizontal className="icon" /> Editar proyecto
        </Link>
      </div>
      <p className="pg-meta">
        <span className="pg-code">{project.code}</span>
        <span className={active ? "pg-live" : "pg-live archived"}>
          <span className="dot" aria-hidden />
          {active ? "Activo" : "Archivado"}
        </span>
        {month ? <span>{month}</span> : null}
        {currencies.length > 0 ? <span>{currencies.join(" · ")}</span> : null}
      </p>
      <section className="pg-kpis pg-kpis-4" aria-label="Accesos del proyecto">
        <Link href="/" onClick={() => session.setActiveProjectId(project.id)}>
          <span>Facturas del proyecto</span>
          <strong>{invoices.length}</strong>
          <span className="iv-detail">
            Ver facturas <ArrowRight className="icon" />
          </span>
        </Link>
        <Link
          className="pg-review"
          href="/?estado=revision"
          style={{ "--heat": invoices.length === 0 ? 0 : Math.min(1, review / invoices.length) } as CSSProperties}
          onClick={() => session.setActiveProjectId(project.id)}
        >
          <span>Por revisar</span>
          <strong>{review}</strong>
          <span className="iv-detail">
            Resolver pendientes <ArrowRight className="icon" />
          </span>
        </Link>
        <Link href={`/?estado=pagado&proyecto=${project.id}`}>
          <span>Decisiones automáticas</span>
          <strong>{paid}</strong>
          <span className="iv-detail">
            Ver pagadas <ArrowRight className="icon" />
          </span>
        </Link>
        <Link href="/estadisticas" onClick={() => session.setActiveProjectId(project.id)}>
          <span>Visión completa</span>
          <strong className="pg-kpi-icon" aria-hidden>
            <LayoutGrid className="icon" />
          </strong>
          <span className="iv-detail">
            Ver estadísticas <ArrowRight className="icon" />
          </span>
        </Link>
      </section>
      <div className="pg-detail">
        <div className="pg-detail-main">
          <section className="panel pg-panel">
            <div className="section-heading">
              <div>
                <h2>Presupuesto del proyecto</h2>
                <p>{month ? `${month} · USD` : "USD"}</p>
              </div>
              <Link className="btn" href="/reglas" onClick={() => session.setActiveProjectId(project.id)}>
                Editar presupuesto
              </Link>
            </div>
            <BudgetMeter label="Disponible" {...budget} />
            <p className="pg-caption">Importes del conjunto local. Los pagos son simulados.</p>
          </section>
          <section className="panel pg-panel" aria-label="Proveedores del proyecto">
            <div className="section-heading">
              <div>
                <h2>Proveedores del proyecto</h2>
                <p>Lista: {project.vendorListName || project.name}</p>
              </div>
              <button className="btn primary" type="button" onClick={openPicker}>
                <Plus className="icon" /> Agregar proveedor
              </button>
            </div>
            {assigned.length === 0 ? (
              <p>Este proyecto todavía no tiene proveedores.</p>
            ) : (
              <ul className="pg-vendor-list">
                {assigned.map((card) => {
                  const agreement = card.agreements?.find((item) => item.projectId === project.id);
                  return (
                    <li key={card.id}>
                      <div>
                        <strong>{vendorDisplay(card.id, card.name)}</strong>
                        <span>{agreement?.service || card.service || card.category}</span>
                        <small>
                          {(agreement?.currencies ?? card.currencies).join(" · ") || "Sin moneda"}
                          {agreement ? ` · Límite ${usd(agreement.limitUsd)}` : ""}
                        </small>
                      </div>
                      <button className="iv-detail" type="button" onClick={() => openAgreement(card)}>
                        Editar acuerdo <ArrowRight className="icon" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
        <aside className="pg-detail-side">
          <p className="pg-eyebrow">Condiciones para pagar</p>
          <section className="panel pg-panel">
            <h2>Criterios de aceptación</h2>
            <p>Se aplican los criterios generales, los de este proyecto y el acuerdo de cada proveedor.</p>
            <p className="pg-count">{generalCriteria + projectCriteria} criterios activos</p>
            <ul className="pg-criteria">
              <li>
                <span>Criterios generales</span>
                <small>General · {generalCriteria}</small>
              </li>
              <li>
                <span>Criterios · {project.code}</span>
                <small>Del proyecto · {projectCriteria}</small>
              </li>
            </ul>
            <Link className="iv-detail" href="/reglas" onClick={() => session.setActiveProjectId(project.id)}>
              Gestionar criterios <ArrowRight className="icon" />
            </Link>
          </section>
          <section className="panel pg-panel">
            <h2>Monedas admitidas</h2>
            {currencies.length === 0 ? (
              <p>Este proyecto todavía no declara monedas.</p>
            ) : (
              <div className="pg-currency-row">
                {currencies.map((code) => (
                  <span key={code}>{code}</span>
                ))}
              </div>
            )}
            <p className="pg-caption">Solo se pagan facturas en estas monedas.</p>
            <Link className="iv-detail" href="/tasas">
              Consultar tasas <ArrowRight className="icon" />
            </Link>
          </section>
          <section className="panel pg-panel">
            <h2>Rendimiento del sistema</h2>
            <p>Cuánto resuelve el agente en este proyecto y cuánto queda para una persona.</p>
            <Link className="iv-detail" href="/estadisticas?tab=tecnico" onClick={() => session.setActiveProjectId(project.id)}>
              Ver rendimiento <ArrowRight className="icon" />
            </Link>
          </section>
          <section className="panel pg-panel pg-manage">
            <h2>Gestión del proyecto</h2>
            <p>
              {active
                ? "Sigue recibiendo facturas. Archivar lo saca de los activos sin borrar nada."
                : "Está archivado. Las facturas, los acuerdos y el historial siguen disponibles."}
            </p>
            {active ? (
              <button className="btn danger" type="button" onClick={() => setConfirmArchive(true)}>
                Archivar proyecto
              </button>
            ) : (
              <button className="btn primary" type="button" onClick={() => session.setProjectStatus(project.id, "active")}>
                Reactivar proyecto
              </button>
            )}
            <p className="pg-caption">El historial se conserva al archivar.</p>
          </section>
        </aside>
      </div>
      <Dialog open={pickerOpen} title="Añadir proveedor" className="id-modal" onClose={() => setPickerOpen(false)}>
        <p>Elige uno de los proveedores que todavía no están en este proyecto.</p>
        <label className="invoice-search pg-add-search">
          <Search className="icon" />
          <span className="visually-hidden">Buscar proveedor</span>
          <input
            type="search"
            value={query}
            placeholder="Buscar por nombre, rubro o país"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="pg-picker" role="listbox" aria-label="Proveedores disponibles">
          {available.length === 0 ? (
            <p>Todos los proveedores ya están asignados.</p>
          ) : matches.length === 0 ? (
            <p>Ningún proveedor coincide con esa búsqueda.</p>
          ) : (
            visibleMatches.map((card) => (
              <button
                key={card.id}
                type="button"
                role="option"
                aria-selected={picked === card.id}
                onClick={() => setPicked(card.id)}
              >
                <strong>{vendorDisplay(card.id, card.name)}</strong>
                <small>
                  {card.category} · {card.country}
                </small>
              </button>
            ))
          )}
        </div>
        {matches.length > VENDOR_RESULT_LIMIT ? (
          <p className="pg-picker-limit" aria-live="polite">
            Mostrando los primeros {VENDOR_RESULT_LIMIT} de {matches.length}. Escribe más para acotar la búsqueda.
          </p>
        ) : null}
        <div className="button-row">
          <button className="btn" type="button" onClick={() => setPickerOpen(false)}>
            Cancelar
          </button>
          <button className="btn primary" type="button" disabled={!picked} onClick={addPicked}>
            Añadir
          </button>
        </div>
      </Dialog>
      <Dialog
        open={agreement !== null}
        title={agreementCard ? vendorDisplay(agreementCard.id, agreementCard.name) : "Acuerdo"}
        onClose={() => setAgreement(null)}
        className="id-modal"
      >
        {agreement && agreementCard ? (
          <form className="agree-form" noValidate onSubmit={saveAgreement}>
            <p className="agree-list">Lista {project.code}</p>
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
                {agreementCurrencies.map((code) => (
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
            <p className="id-callout">Estos cambios solo afectan al acuerdo de {project.name}.</p>
            <div className="button-row">
              <button className="btn" type="button" onClick={() => setAgreement(null)}>
                Cancelar
              </button>
              <button className="btn primary" type="submit">
                Guardar acuerdo
              </button>
            </div>
          </form>
        ) : null}
      </Dialog>
      <Dialog open={confirmArchive} title="Archivar proyecto" onClose={() => setConfirmArchive(false)} className="id-modal">
        <p>
          ¿Archivar {project.name}? Deja de mostrarse entre los activos. Las facturas, los acuerdos y el historial se conservan.
        </p>
        <div className="button-row">
          <button className="btn" type="button" onClick={() => setConfirmArchive(false)}>
            Cancelar
          </button>
          <button
            className="btn danger"
            type="button"
            onClick={() => {
              session.setProjectStatus(project.id, "archived");
              setConfirmArchive(false);
            }}
          >
            Archivar
          </button>
        </div>
      </Dialog>
    </>
  );
}
