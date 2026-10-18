"use client";

import { useSession } from "@/components/session/session-provider";
import { usd } from "@/lib/format";
import { orderedProjects, usesFavorites } from "@/lib/mock-data/nav";
import { ArrowRight, Plus, Star } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function ProjectsView() {
  const session = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const visible = orderedProjects(session.projects, session.nav.order);
  const overflow = usesFavorites(visible.length);
  const openCreate = session.setCreateProjectOpen;

  useEffect(() => {
    if (params.get("crear") !== "1") return;
    openCreate(true);
    router.replace("/proyectos");
  }, [openCreate, params, router]);

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
          <button className="btn primary" type="button" onClick={() => openCreate(true)}>
            <Plus className="icon" /> Crear proyecto
          </button>
        </div>
      </div>
      <div className="pg-grid">
        {visible.map((project) => {
          const total = project.rules.monthlyBudgetUsd ?? session.rules.monthlyBudgetUsd;
          const invoices = session.invoices.filter((invoice) => invoice.projectId === project.id);
          const favorite = session.nav.favorites.includes(project.id);
          return (
            <article className="panel pg-card" key={project.id}>
              <Link className="pg-card-link" href={`/proyectos/${project.id}`} onClick={() => session.rememberProject(project.id)}>
                <span className="pg-code">{project.code}</span>
                <h2>{project.name}</h2>
                <dl className="pg-stats">
                  <div>
                    <dt>Tope</dt>
                    <dd>{usd(total)}</dd>
                  </div>
                  <div>
                    <dt>Facturas</dt>
                    <dd>{invoices.length}</dd>
                  </div>
                  <div>
                    <dt>Proveedores</dt>
                    <dd>{project.vendorIds.length}</dd>
                  </div>
                </dl>
                <span className="iv-detail">
                  Abrir proyecto <ArrowRight className="icon" />
                </span>
              </Link>
              {overflow ? (
                <button
                  className="pg-fav"
                  type="button"
                  aria-pressed={favorite}
                  aria-label={favorite ? `Quitar ${project.name} de favoritos` : `Marcar ${project.name} como favorito`}
                  onClick={() => session.toggleFavorite(project.id)}
                >
                  <Star className="icon" aria-hidden="true" />
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </>
  );
}
