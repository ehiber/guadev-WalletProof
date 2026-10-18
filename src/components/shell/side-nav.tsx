"use client";

import { useSession } from "@/components/session/session-provider";
import { ProjectNavList } from "@/components/shell/project-nav-list";
import { orderedProjects, sidebarProjects, usesFavorites, type NavSection } from "@/lib/mock-data/nav";
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Clock,
  FileText,
  LayoutGrid,
  Mail,
  Plus,
  Scale,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

const GROUPS: Array<{
  id: string;
  href: string;
  label: string;
  icon: typeof FileText;
  section?: NavSection;
  match: (path: string) => boolean;
}> = [
  { id: "inbox", href: "/", label: "Facturas", icon: FileText, match: (path) => path === "/" || path.startsWith("/facturas") },
  { id: "projects", href: "/proyectos", label: "Proyectos", icon: LayoutGrid, section: "projects", match: (path) => path.startsWith("/proyectos") },
  { id: "mail", href: "/correo", label: "Bandeja de correos", icon: Mail, match: (path) => path.startsWith("/correo") },
  { id: "providers", href: "/proveedores", label: "Proveedores", icon: Users, match: (path) => path.startsWith("/proveedores") },
  { id: "rules", href: "/reglas", label: "Criterios de aceptación", icon: SlidersHorizontal, section: "rules", match: (path) => path.startsWith("/reglas") },
  { id: "stats", href: "/estadisticas", label: "Estadísticas", icon: BarChart3, section: "stats", match: (path) => path.startsWith("/estadisticas") },
  { id: "rates", href: "/tasas", label: "Tasas", icon: Scale, match: (path) => path.startsWith("/tasas") },
  { id: "activity", href: "/registro", label: "Registro", icon: Clock, match: (path) => path.startsWith("/registro") },
];

export function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const session = useSession();
  const activeProject = pathname.startsWith("/proyectos/") ? pathname.split("/")[2] : "";
  const rulesProject = pathname.startsWith("/reglas") ? params.get("proyecto") : null;
  const statsProject = pathname.startsWith("/estadisticas") ? params.get("proyecto") : null;

  const ordered = orderedProjects(session.projects, session.nav.order);
  const overflow = usesFavorites(ordered.length);
  const listed = sidebarProjects(session.projects, session.nav);

  const subs: Partial<Record<string, ReactNode>> = {
    projects: (
      <>
        {listed.length > 0 ? (
          <ProjectNavList
            projects={listed}
            activeId={activeProject}
            overflow={overflow}
            onOpen={(id) => {
              session.rememberProject(id);
              session.setActiveProjectId(id);
              onNavigate?.();
            }}
            onPlace={session.placeProject}
            onUnfavorite={session.toggleFavorite}
          />
        ) : (
          <span className="ws-subtitle">{overflow ? "Sin favoritos" : "Sin proyectos"}</span>
        )}
        {overflow ? (
          <Link href="/proyectos" aria-current={pathname === "/proyectos" ? "page" : undefined} onClick={onNavigate}>
            Ver todos ({ordered.length})
          </Link>
        ) : null}
      </>
    ),
    rules: (
      <>
        <Link href="/reglas" aria-current={pathname.startsWith("/reglas") && !rulesProject ? "page" : undefined} onClick={onNavigate}>
          Generales de empresa
        </Link>
        {listed.map((project) => (
          <Link
            key={project.id}
            href={`/reglas?proyecto=${project.id}`}
            aria-current={rulesProject === project.id ? "page" : undefined}
            onClick={onNavigate}
          >
            {project.name}
          </Link>
        ))}
      </>
    ),
    stats: (
      <>
        <Link
          href="/estadisticas"
          aria-current={pathname.startsWith("/estadisticas") && params.get("tab") !== "tecnico" && !statsProject ? "page" : undefined}
          onClick={onNavigate}
        >
          Resumen global
        </Link>
        <Link
          href="/estadisticas?tab=tecnico"
          aria-current={pathname.startsWith("/estadisticas") && params.get("tab") === "tecnico" ? "page" : undefined}
          onClick={onNavigate}
        >
          Rendimiento del sistema
        </Link>
        {listed.map((project) => (
          <Link
            key={project.id}
            href={`/estadisticas?proyecto=${project.id}`}
            aria-current={statsProject === project.id ? "page" : undefined}
            onClick={onNavigate}
          >
            {project.name}
          </Link>
        ))}
      </>
    ),
  };

  return (
    <nav className="nav" aria-label="Navegación principal">
      {GROUPS.map((item) => {
        const Icon = item.icon;
        const open = item.section ? session.nav.open[item.section] : false;
        return (
          <div className="ws-nav-group" key={item.id}>
            <div className="ws-nav-row">
              <Link href={item.href} aria-current={item.match(pathname) ? "page" : undefined} onClick={onNavigate}>
                <Icon className="icon" />
                <span>{item.label}</span>
                {item.id === "inbox" && session.reviewCount > 0 ? <span className="nav-count">{session.reviewCount}</span> : null}
              </Link>
              {item.id === "projects" ? (
                <button className="ws-expand" type="button" aria-label="Crear proyecto" onClick={() => session.setCreateProjectOpen(true)}>
                  <Plus className="icon" />
                </button>
              ) : null}
              {item.section ? (
                <button
                  className="ws-expand"
                  type="button"
                  aria-expanded={open}
                  aria-controls={`sub-${item.id}`}
                  aria-label={`${open ? "Contraer" : "Desplegar"} ${item.label}`}
                  onClick={() => session.toggleNav(item.section!)}
                >
                  {open ? <ChevronUp className="icon" /> : <ChevronDown className="icon" />}
                </button>
              ) : null}
            </div>
            {item.section && subs[item.id] ? (
              <div className="ws-subnav" id={`sub-${item.id}`} hidden={!open}>
                {subs[item.id]}
              </div>
            ) : null}
          </div>
        );
      })}
      <Link href="/ayuda" aria-current={pathname.startsWith("/ayuda") ? "page" : undefined} onClick={onNavigate}>
        <CircleHelp className="icon" />
        <span>Ayuda</span>
      </Link>
    </nav>
  );
}
