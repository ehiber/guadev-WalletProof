import { normalizeRules } from "@/lib/engine/criteria";
import { VENDORS } from "@/lib/mock-data/company-rules";
import type { CompanyRules, Invoice, Project, ProjectRules } from "@/types/blinka";

export const ALL_PROJECTS = "all";
export const DEMO_PROJECT_ID = "prj-operacion";
export const ANDINO_PROJECT_ID = "prj-andino";
export const MEXICO_PROJECT_ID = "prj-expansion-mexico";

export const INITIAL_PROJECTS: Project[] = [
  {
    id: DEMO_PROJECT_ID,
    name: "Operación octubre",
    code: "OCT-26",
    status: "active",
    description: "Servicios administrativos y operación de la empresa.",
    vendorListName: "Operación octubre",
    budgetMonth: "2026-10",
    currencies: ["USD", "COP"],
    vendorIds: VENDORS.map((vendor) => vendor.id),
    rules: {},
  },
  {
    id: ANDINO_PROJECT_ID,
    name: "Lanzamiento Andino",
    code: "AND-26",
    status: "active",
    description: "Operación cloud y desarrollo para Latinoamérica.",
    vendorListName: "Lanzamiento Andino",
    budgetMonth: "2026-10",
    currencies: ["USD", "MXN"],
    vendorIds: ["vendor-cloudnova", "vendor-andessoft", "vendor-lexglobal"],
    rules: { maxAutoApproveUsd: 200, monthlyBudgetUsd: 800 },
  },
  {
    id: MEXICO_PROJECT_ID,
    name: "Expansión México",
    code: "MEX-26",
    status: "active",
    description: "Apertura operativa en México con proveedores locales y control de gasto en MXN.",
    vendorListName: "Expansión México",
    budgetMonth: "2026-10",
    currencies: ["USD", "MXN"],
    vendorIds: ["vendor-nubemex", "vendor-fiscalmx", "vendor-rutanorte"],
    rules: { maxAutoApproveUsd: 300, monthlyBudgetUsd: 900 },
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
