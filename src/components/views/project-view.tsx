"use client";

import { useSession } from "@/components/session/session-provider";
import { usd, vendorDisplay } from "@/lib/format";
import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export function ProjectView({ id }: { id: string }) {
  const session = useSession();
  const project = session.projects.find((item) => item.id === id);

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
  const paid = invoices.reduce((sum, invoice) => {
    const record = session.records.find((item) => item.invoiceId === invoice.id);
    return record && session.statusOf(record) === "APPROVED" ? sum + record.totalPayableUsd : sum;
  }, 0);
  const total = project.rules.monthlyBudgetUsd ?? session.rules.monthlyBudgetUsd;
  const vendors = project.vendorIds
    .map((vendorId) => session.vendors.find((vendor) => vendor.id === vendorId))
    .filter((vendor) => vendor != null);

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
        <div className="pg-paid">
          <span>Pagado</span>
          <strong>{usd(paid)}</strong>
          <small>de {usd(total)}</small>
        </div>
      </div>
      <section className="pg-kpis" aria-label="Ir a las facturas del proyecto">
        <Link href="/" onClick={() => session.setActiveProjectId(project.id)}>
          <span>Todas las facturas</span>
          <strong>{invoices.length}</strong>
          <small>
            Abrir en la bandeja
            <ChevronRight className="icon" aria-hidden />
          </small>
        </Link>
        <Link href="/?estado=revision" onClick={() => session.setActiveProjectId(project.id)}>
          <span>Por revisar</span>
          <strong>{review}</strong>
          <small>
            Abrir las que esperan a una persona
            <ChevronRight className="icon" aria-hidden />
          </small>
        </Link>
      </section>
      <section className="panel">
        <h2>Proveedores asignados</h2>
        {vendors.length === 0 ? (
          <p>Este proyecto todavía no tiene proveedores. Puedes asignarlos desde el directorio.</p>
        ) : (
          <ul className="pg-vendors">
            {vendors.map((vendor) => (
              <li key={vendor.id}>
                <Link href={`/proveedores/${vendor.id}`}>{vendorDisplay(vendor.id, vendor.legalName)}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
