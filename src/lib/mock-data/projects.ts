import { normalizeRules } from "@/lib/engine/criteria";
import { VENDORS } from "@/lib/mock-data/company-rules";
import type { CompanyRules, Invoice, Project, ProjectRules } from "@/types/blinka";

export const ALL_PROJECTS = "all";
export const DEMO_PROJECT_ID = "prj-operacion";

export const INITIAL_PROJECTS: Project[] = [
  {
    id: DEMO_PROJECT_ID,
    name: "Operación octubre",
    code: "OCT-26",
    status: "active",
    vendorIds: VENDORS.map((vendor) => vendor.id),
    rules: {},
  },
  {
    id: "prj-andino",
    name: "Lanzamiento Andino",
    code: "AND-26",
    status: "active",
    vendorIds: ["vendor-cloudnova", "vendor-lexglobal"],
    rules: { maxAutoApproveUsd: 200, monthlyBudgetUsd: 800 },
  },
];

export type ProjectScope = {
  assigned: boolean;
  vendorOnProject: boolean;
  projectBudgetUsd?: number;
  projectSpentUsd: number;
};

export function effectiveRules(macro: CompanyRules, overlay: ProjectRules | undefined): CompanyRules {
  if (!overlay) return macro;
  const criteria = macro.criteria.map((item) => {
    const patch = overlay.criteria?.[item.id];
    if (!patch) return item;
    return {
      id: item.id,
      action: patch.action ?? item.action,
      enabled: patch.enabled ?? item.enabled,
    };
  });
  return normalizeRules({
    ...macro,
    maxAutoApproveUsd: overlay.maxAutoApproveUsd ?? macro.maxAutoApproveUsd,
    jevConfidenceThreshold: overlay.jevConfidenceThreshold ?? macro.jevConfidenceThreshold,
    semanticDuplicateMinProbability: overlay.semanticDuplicateMinProbability ?? macro.semanticDuplicateMinProbability,
    criteria,
  });
}

export function scopeFor(invoice: Invoice, projects: Project[] | undefined, projectSpentUsd: number): {
  rulesOverlay: ProjectRules | undefined;
  scope?: ProjectScope;
} {
  if (!projects) return { rulesOverlay: undefined };
  const project = projects.find((item) => item.id === invoice.projectId && item.status === "active");
  if (!project) {
    return {
      rulesOverlay: undefined,
      scope: { assigned: false, vendorOnProject: true, projectSpentUsd: 0 },
    };
  }
  return {
    rulesOverlay: project.rules,
    scope: {
      assigned: true,
      vendorOnProject: project.vendorIds.includes(invoice.vendorId),
      projectBudgetUsd: project.rules.monthlyBudgetUsd,
      projectSpentUsd,
    },
  };
}
