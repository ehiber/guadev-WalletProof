"use client";

import { BudgetMeter, purse } from "@/components/budget-meter";
import { useSession } from "@/components/session/session-provider";
import { Dialog } from "@/components/ui/ui";
import { vendorDisplay } from "@/lib/format";
import { ArrowLeft, ArrowRight, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

export function ProjectView({ id }: { id: string }) {
  const session = useSession();
  const project = session.projects.find((item) => item.id === id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [showAllVendors, setShowAllVendors] = useState(false);

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
  const assigned = project.vendorIds
    .map((vendorId) => session.vendorCards.find((card) => card.id === vendorId))
    .filter((card) => card != null);
  const available = session.vendorCards.filter((card) => !project.vendorIds.includes(card.id));
  const needle = query.trim().toLowerCase();
  const matches = available.filter((card) => {
    const haystack = `${card.name} ${card.legal} ${card.category} ${card.country}`.toLowerCase();
    return haystack.includes(needle);
  });

  function openPicker() {
    setQuery("");
    setPicked(null);
    setPickerOpen(true);
  }

  function addPicked() {
    if (!picked) return;
    session.addVendorToProject(project.id, picked);
    setPickerOpen(false);
  }

  return (
    <>
      <Link className="back" href="/proyectos">
        <ArrowLeft className="icon" /> Todos los proyectos
      </Link>
      <div className="page-heading">
        <div>
          <h1>{project.name}</h1>
          <p>
            {project.code} · {project.status === "active" ? "Activo" : "Archivado"}
            {project.rules.monthlyBudgetUsd == null ? " · usa el tope de la empresa" : " · tope propio"}
          </p>
        </div>
        <BudgetMeter label={`Disponible de ${project.name}`} {...budget} />
      </div>
      <section className="pg-kpis" aria-label="Ir a las facturas del proyecto">
        <Link href="/" onClick={() => session.setActiveProjectId(project.id)}>
          <span>Todas las facturas</span>
          <strong>{invoices.length}</strong>
          <span className="iv-detail">
            Abrir facturas <ArrowRight className="icon" />
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
            Abrir pendientes <ArrowRight className="icon" />
          </span>
        </Link>
      </section>
      <section className="pg-assigned" aria-label="Proveedores asignados">
        <div className="section-heading">
          <h2>Proveedores asignados</h2>
          <button className="btn primary" type="button" onClick={openPicker}>
            <Plus className="icon" /> Añadir proveedor
          </button>
        </div>
        {assigned.length === 0 ? (
          <p>Este proyecto todavía no tiene proveedores.</p>
        ) : (
          <>
            <div className="pg-vendor-grid">
              {(showAllVendors ? assigned : assigned.slice(0, 5)).map((card) => (
                <Link className="pg-vendor-card" href={`/proveedores/${card.id}`} key={card.id}>
                  <span className="pg-vendor-mark" aria-hidden>
                    {initials(card.name)}
                  </span>
                  <strong>{vendorDisplay(card.id, card.name)}</strong>
                  <span>{card.category}</span>
                  <small>{card.country}</small>
                </Link>
              ))}
            </div>
            {assigned.length > 5 ? (
              <div className="pg-vendor-more">
                <button className="btn primary" type="button" onClick={() => setShowAllVendors((current) => !current)}>
                  {showAllVendors ? "Ver solo 5" : `Ver ${assigned.length - 5} más`}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
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
            matches.map((card) => (
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
        <div className="button-row">
          <button className="btn" type="button" onClick={() => setPickerOpen(false)}>
            Cancelar
          </button>
          <button className="btn primary" type="button" disabled={!picked} onClick={addPicked}>
            Añadir
          </button>
        </div>
      </Dialog>
    </>
  );
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}
