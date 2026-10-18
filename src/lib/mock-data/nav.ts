import { ANDINO_PROJECT_ID, DEMO_PROJECT_ID, MEXICO_PROJECT_ID } from "@/lib/mock-data/projects";
import type { Project } from "@/types/blinka";

export const SIDEBAR_PROJECT_LIMIT = 5;

export type NavSection = "projects" | "rules" | "stats";

export type NavPrefs = {
  open: Record<NavSection, boolean>;
  order: string[];
  favorites: string[];
};

export function freshNav(): NavPrefs {
  return {
    open: { projects: true, rules: false, stats: false },
    order: [DEMO_PROJECT_ID, ANDINO_PROJECT_ID, MEXICO_PROJECT_ID],
    favorites: [],
  };
}

export function usesFavorites(count: number) {
  return count > SIDEBAR_PROJECT_LIMIT;
}

export function orderedProjects(projects: Project[], order: string[]): Project[] {
  const active = projects.filter((project) => project.status === "active");
  const byId = new Map(active.map((project) => [project.id, project]));
  const seen = new Set<string>();
  const ordered: Project[] = [];
  for (const id of order) {
    const project = byId.get(id);
    if (!project || seen.has(project.id)) continue;
    seen.add(project.id);
    ordered.push(project);
  }
  for (const project of active) {
    if (seen.has(project.id)) continue;
    ordered.push(project);
  }
  return ordered;
}

export function sidebarProjects(projects: Project[], nav: NavPrefs): Project[] {
  const ordered = orderedProjects(projects, nav.order);
  if (!usesFavorites(ordered.length)) return ordered;
  const favorite = new Set(nav.favorites);
  return ordered.filter((project) => favorite.has(project.id));
}

export function reorderIds(order: string[], visibleIds: string[], fromId: string, toId: string): string[] | null {
  if (fromId === toId) return null;
  const from = visibleIds.indexOf(fromId);
  const to = visibleIds.indexOf(toId);
  if (from < 0 || to < 0) return null;
  const nextVisible = [...visibleIds];
  const [moved] = nextVisible.splice(from, 1);
  if (!moved) return null;
  nextVisible.splice(to, 0, moved);
  const visible = new Set(visibleIds);
  const normalized = [...order];
  for (const id of visibleIds) {
    if (!normalized.includes(id)) normalized.push(id);
  }
  let cursor = 0;
  return normalized.map((id) => {
    if (!visible.has(id)) return id;
    const next = nextVisible[cursor];
    cursor += 1;
    return next ?? id;
  });
}
