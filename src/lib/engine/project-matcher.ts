import type { Invoice, Project, ProjectAssignment } from "@/types/blinka";

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function containsReference(haystack: string, reference: string): boolean {
  const candidate = normalized(reference);
  return candidate.length > 0 && ` ${haystack} `.includes(` ${candidate} `);
}

export function matchProject(invoice: Invoice, projects: Project[]): ProjectAssignment | null {
  const active = projects.filter((project) => project.status === "active");
  const evidence = normalized(
    [invoice.projectReference, invoice.description, ...invoice.lineItems, invoice.evidenceNote].filter(Boolean).join(" "),
  );
  const explicit = active.filter((project) =>
    [project.id, project.code, project.name].some((reference) => containsReference(evidence, reference)),
  );

  if (explicit.length === 1) {
    const project = explicit[0];
    const reference = [project.code, project.name, project.id].find((value) => containsReference(evidence, value))!;
    return {
      projectId: project.id,
      method: "explicit-reference",
      evidence: `Referencia exacta "${reference}" encontrada en el documento.`,
    };
  }
  if (explicit.length > 1) return null;

  const eligible = active.filter((project) => {
    if (!project.vendorIds.includes(invoice.vendorId)) return false;
    if (project.currencies?.length && !project.currencies.includes(invoice.currency)) return false;
    if (project.budgetMonth && project.budgetMonth !== invoice.periodKey) return false;
    return true;
  });
  if (eligible.length !== 1) return null;
  return {
    projectId: eligible[0].id,
    method: "unique-eligibility",
    evidence: `Único proyecto activo compatible con proveedor, moneda y periodo: ${eligible[0].code}.`,
  };
}

export function assignProject(invoice: Invoice, projects: Project[]): Invoice {
  if (invoice.projectId && projects.some((project) => project.id === invoice.projectId && project.status === "active")) return invoice;
  const assignment = matchProject(invoice, projects);
  if (!assignment) {
    const unassigned = { ...invoice };
    delete unassigned.projectId;
    delete unassigned.projectAssignment;
    return unassigned;
  }
  return { ...invoice, projectId: assignment.projectId, projectAssignment: assignment };
}
