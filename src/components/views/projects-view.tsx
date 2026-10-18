"use client";

import { useSession } from "@/components/session/session-provider";
import { budgetMonthLabel, usd } from "@/lib/format";
import { orderedProjects, usesFavorites } from "@/lib/mock-data/nav";
import type { Project } from "@/types/blinka";
import { ArrowRight, Plus, Search, Star } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type StatusFilter = "active" | "archived" | "all";

const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "active", label: "Activos" },
  { id: "archived", label: "Archivados" },
  { id: "all", label: "Todos" },
];

export function ProjectsView() {
  const session = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const visible = orderedProjects(session.projects, session.nav.order);
  const overflow = usesFavorites(visible.length);
  const needle = query.trim().toLowerCase();
  const shown = visible.filter((project) => {
    if (status !== "all" && project.status !== status) return false;
    if (!needle) return true;
    const haystack = [project.name, project.code, project.vendorListName ?? ""].join(" ").toLowerCase();
    return haystack.includes(needle);
  });

  useEffect(() => {
    if (params.get("crear") !== "1") return;
    router.replace("/proyectos/nuevo");
  }, [params, router]);

  const paidByProject = useMemo(() => {
    const invoices = new Map(session.invoices.map((invoice) => [invoice.id, invoice]));
    const paid = new Map<string, number>();
    for (const record of session.records) {
      if (session.statusOf(record) !== "APPROVED") continue;
      const projectId = invoices.get(record.invoiceId)?.projectId;
      if (!projectId) continue;
      paid.set(projectId, Number(((paid.get(projectId) ?? 0) + record.totalPayableUsd).toFixed(2)));
    }
    return paid;
  }, [session]);

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Proyectos</h1>
          <p>
            Presupuesto, proveedores y criterios de cada trabajo, dentro de la misma empresa.
            {overflow ? " Con más de cinco, el menú lateral muestra solo los favoritos." : ""}
          </p>
        </div>
        <div className="heading-actions">
          <Link className="btn primary" href="/proyectos/nuevo">
            <Plus className="icon" /> Crear proyecto
          </Link>
        </div>
      </div>
      <label className="invoice-search pg-search">
        <Search className="icon" aria-hidden="true" />
        <input
          value={query}
          placeholder="Buscar nombre, código o lista"
          aria-label="Buscar nombre, código o lista"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="pg-filters">
        <div className="pg-pills" role="tablist" aria-label="Estado del proyecto">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={status === filter.id}
              onClick={() => setStatus(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <p>
          {shown.length} {shown.length === 1 ? "proyecto" : "proyectos"}
        </p>
      </div>
      {shown.length === 0 ? (
        <div className="panel empty">
          <h3>Ningún proyecto coincide</h3>
          <p>Prueba con otro nombre, código o lista, o cambia el estado.</p>
        </div>
      ) : (
        <div className="pg-grid">
          {shown.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              budget={project.rules.monthlyBudgetUsd ?? session.rules.monthlyBudgetUsd}
              paid={paidByProject.get(project.id) ?? 0}
              invoices={session.invoices.filter((invoice) => invoice.projectId === project.id).length}
              favorite={overflow ? session.nav.favorites.includes(project.id) : null}
              onFavorite={() => session.toggleFavorite(project.id)}
              onOpen={() => session.rememberProject(project.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ProjectCard({
  project,
  budget,
  paid,
  invoices,
  favorite,
  onFavorite,
  onOpen,
}: {
  project: Project;
  budget: number;
  paid: number;
  invoices: number;
  favorite: boolean | null;
  onFavorite: () => void;
  onOpen: () => void;
}) {
  const month = budgetMonthLabel(project.budgetMonth);
  const width = budget > 0 ? Math.min(100, (paid / budget) * 100) : 0;
  const currencies = (project.currencies ?? []).join(" · ");
  return (
    <article className="panel pg-card pg-board">
      <div className="pg-card-top">
        <span className="pg-code">{project.code}</span>
        <span className="pg-card-tools">
          {favorite == null ? null : (
            <button
              className="pg-fav"
              type="button"
              aria-pressed={favorite}
              aria-label={favorite ? `Quitar ${project.name} de favoritos` : `Marcar ${project.name} como favorito`}
              onClick={onFavorite}
            >
              <Star className="icon" aria-hidden="true" />
            </button>
          )}
          <span className={project.status === "active" ? "pg-live" : "pg-live archived"}>
            <span className="dot" aria-hidden="true" />
            {project.status === "active" ? "Activo" : "Archivado"}
          </span>
        </span>
      </div>
      <h2>{project.name}</h2>
      {project.description ? <p className="pg-desc">{project.description}</p> : null}
      {month ? <p className="pg-available">Disponible · {month}</p> : null}
      <p className="pg-amount">
        <strong>{usd(budget)}</strong>
        <span>USD</span>
      </p>
      <div className="budget-bar" aria-hidden="true">
        <span className="budget-approved" style={{ width: `${width}%` }} />
      </div>
      <div className="pg-bar-meta">
        <span>Pagado {usd(paid)}</span>
        <span>Presupuesto {usd(budget)}</span>
      </div>
      <p className="pg-foot">
        {countLabel(project.vendorIds.length, "proveedor", "proveedores")}
        {" · "}
        {countLabel(invoices, "factura", "facturas")}
        {currencies ? ` · ${currencies}` : ""}
      </p>
      <Link className="iv-detail" href={`/proyectos/${project.id}`} onClick={onOpen}>
        Abrir proyecto <ArrowRight className="icon" />
      </Link>
    </article>
  );
}

function countLabel(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}
