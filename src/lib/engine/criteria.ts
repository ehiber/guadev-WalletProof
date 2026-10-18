import type {
  AuditRecord,
  CompanyRules,
  CriterionAction,
  CriterionId,
  Invoice,
  RuleCriterion,
} from "@/types/blinka";

export const CRITERION_ORDER: CriterionId[] = [
  "duplicate",
  "semanticDuplicate",
  "whitelist",
  "anomalyHigh",
  "projectVendor",
  "contract",
  "limit",
  "budget",
  "project",
  "fx",
  "lineCheck",
];

export const BUSINESS_CRITERION_ORDER: CriterionId[] = CRITERION_ORDER.filter((id) => id !== "fx" && id !== "lineCheck");
export const SYSTEM_CRITERION_ORDER: CriterionId[] = ["fx", "lineCheck"];

export const CRITERION_LABEL: Record<CriterionId, string> = {
  duplicate: "Coincidencia exacta",
  semanticDuplicate: "Posible cobro repetido",
  budget: "Presupuesto disponible",
  anomalyHigh: "Cuenta registrada y sin señales críticas",
  whitelist: "Proveedor en la lista permitida",
  project: "Proyecto identificado",
  projectVendor: "Proveedor permitido en el proyecto",
  fx: "Tasa de conversión disponible",
  limit: "Límite por factura",
  lineCheck: "Importes y total coherentes",
  contract: "Servicio acorde con lo contratado",
};

export const DEFAULT_CRITERIA: RuleCriterion[] = [
  { id: "duplicate", action: "BLOCKED", enabled: true },
  { id: "semanticDuplicate", action: "ESCALATED", enabled: true },
  { id: "whitelist", action: "ESCALATED", enabled: true },
  { id: "anomalyHigh", action: "ESCALATED", enabled: true },
  { id: "projectVendor", action: "ESCALATED", enabled: true },
  { id: "contract", action: "ESCALATED", enabled: true },
  { id: "limit", action: "ESCALATED", enabled: true },
  { id: "budget", action: "ESCALATED", enabled: true },
  { id: "project", action: "ESCALATED", enabled: true },
  { id: "fx", action: "ESCALATED", enabled: true },
  { id: "lineCheck", action: "BLOCKED", enabled: true },
];

export function criterionOf(rules: CompanyRules, id: CriterionId): RuleCriterion {
  return rules.criteria.find((item) => item.id === id) ?? DEFAULT_CRITERIA.find((item) => item.id === id)!;
}

export function criterionEnabled(rules: CompanyRules, id: CriterionId): boolean {
  return criterionOf(rules, id).enabled;
}

export function normalizeRules(
  input: Omit<CompanyRules, "criteria"> & { criteria?: RuleCriterion[] },
): CompanyRules {
  const byId = new Map((input.criteria ?? []).map((item) => [item.id, item]));
  return {
    maxAutoApproveUsd: input.maxAutoApproveUsd,
    monthlyBudgetUsd: input.monthlyBudgetUsd,
    jevConfidenceThreshold: input.jevConfidenceThreshold,
    semanticDuplicateMinProbability: input.semanticDuplicateMinProbability,
    criteria: DEFAULT_CRITERIA.map((item) => {
      const found = byId.get(item.id);
      if (!found) return { ...item };
      return {
        id: item.id,
        action: item.id === "project" ? "ESCALATED" : found.action,
        enabled: found.enabled,
      };
    }),
  };
}

export function cloneRules(rules: CompanyRules): CompanyRules {
  return normalizeRules({ ...rules, criteria: rules.criteria.map((item) => ({ ...item })) });
}

export type CheckRow = {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  action: CriterionAction | "PERMANENT" | null;
};

function fxDetail(invoice: Invoice, record: AuditRecord, rules: CompanyRules): string {
  if (!criterionOf(rules, "fx").enabled) return "Criterio desactivado. No decide esta factura.";
  if (!record.fxSnapshot) {
    const dated = record.hardRulesResult.reasons.find((item) => item.startsWith("No hay tasa"));
    return dated ?? `No hay tasa para ${invoice.currency} el día de pago.`;
  }
  const modified = record.fxSnapshot.source === "Tasa modificada" ? "Tasa modificada · " : "";
  return `${modified}1 USD = ${record.fxSnapshot.rateToUsd} ${record.fxSnapshot.currency} · ${record.fxSnapshot.date}`;
}

export function describeChecks(invoice: Invoice, record: AuditRecord): CheckRow[] {
  const rules = normalizeRules(record.rulesSnapshot);
  const hard = record.hardRulesResult;
  const jev = record.jevResult;
  const rows: CheckRow[] = [
    {
      id: "extraction",
      label: "Campos obligatorios",
      pass: hard.extractionValid !== false,
      detail: hard.extractionValid === false ? invoice.extractionNote || "Faltan campos obligatorios." : "La extracción trae los campos obligatorios.",
      action: hard.extractionValid === false ? "PERMANENT" : null,
    },
    {
      id: "fx",
      label: CRITERION_LABEL.fx,
      pass: hard.extractionValid === false || !criterionOf(rules, "fx").enabled || hard.fxValid,
      detail:
        hard.extractionValid === false
          ? "La tasa se revisa cuando la extracción está completa."
          : fxDetail(invoice, record, rules),
      action:
        hard.extractionValid !== false && criterionOf(rules, "fx").enabled && !hard.fxValid
          ? criterionOf(rules, "fx").action
          : null,
    },
  ];

  if (invoice.bankAccountCheck) {
    const bankCriterion = criterionOf(rules, "anomalyHigh");
    rows.push({
      id: "bankAccount",
      label: "Cuenta de pago registrada",
      pass: !bankCriterion.enabled || hard.bankAccountMatches !== false,
      detail:
        invoice.bankAccountCheck.usedDefault
          ? `La factura no indica otra cuenta. Se mantiene ${invoice.bankAccountCheck.requested}, la cuenta predeterminada del proveedor.`
          : hard.bankAccountMatches !== false
          ? `La cuenta ${invoice.bankAccountCheck.requested} está registrada para el proveedor.`
          : `La cuenta ${invoice.bankAccountCheck.requested} no coincide con las cuentas registradas del proveedor.`,
      action: bankCriterion.enabled && hard.bankAccountMatches === false ? bankCriterion.action : null,
    });
  }

  const hardRows: Array<{ id: CriterionId; pass: boolean; detail: string }> = [
    {
      id: "duplicate",
      pass: !hard.isExactDuplicate,
      detail: hard.isExactDuplicate ? "Misma referencia y proveedor, o mismo hash." : "Sin coincidencia exacta en este lote.",
    },
    {
      id: "budget",
      pass: hard.isWithinPeriodBudget,
      detail: hard.fxValid
        ? `${hard.totalPayableUsd.toFixed(2)} USD frente al saldo del periodo.`
        : "Sin equivalente en USD. El presupuesto no se evalúa.",
    },
    {
      id: "whitelist",
      pass: hard.isVendorWhitelisted,
      detail: hard.isVendorWhitelisted ? "El proveedor está activo." : "El proveedor no está activo en la lista.",
    },
    {
      id: "project",
      pass: hard.hasProject,
      detail: hard.hasProject ? "Hay un proyecto asignado." : "Sin proyecto. La factura escala a revisión.",
    },
    {
      id: "projectVendor",
      pass: hard.isVendorOnProject,
      detail: !hard.hasProject
        ? "Se revisa cuando la factura tiene proyecto."
        : hard.isVendorOnProject
          ? "El proveedor está en ese proyecto."
          : "El proveedor no está asignado a este proyecto.",
    },
    {
      id: "limit",
      pass: hard.isWithinSingleLimit,
      detail: hard.fxValid
        ? `${hard.totalPayableUsd.toFixed(2)} USD frente al tope de ${rules.maxAutoApproveUsd.toFixed(2)} USD.`
        : "Sin equivalente en USD. El tope no se evalúa.",
    },
    {
      id: "lineCheck",
      pass: !hard.lineCheck,
      detail: invoice.lineCheck || "Las líneas no contradicen el total.",
    },
  ];

  for (const row of hardRows) {
    const criterion = criterionOf(rules, row.id);
    rows.push({
      id: row.id,
      label: CRITERION_LABEL[row.id],
      pass: !criterion.enabled || row.pass,
      detail: criterion.enabled ? row.detail : "Criterio desactivado. No decide esta factura.",
      action: criterion.enabled && !row.pass ? (row.id === "project" ? "ESCALATED" : criterion.action) : null,
    });
  }

  if (!jev) {
    rows.push({
      id: "jev",
      label: "Revisión JEV",
      pass: !hard.passed,
      detail: hard.passed ? "JEV no devolvió resultado. Escala a una persona." : "No se consulta JEV hasta que pasen las reglas duras.",
      action: hard.passed ? "ESCALATED" : null,
    });
    return rows;
  }

  if (jev.socialEngineeringRisk.score === "MEDIUM") {
    rows.push({
      id: "anomalyMedium",
      label: "Anomalía media",
      pass: false,
      detail: "El riesgo medio escala a una persona.",
      action: "ESCALATED",
    });
  }

  const anomaly = criterionOf(rules, "anomalyHigh");
  const high = jev.socialEngineeringRisk.score === "HIGH";
  rows.push({
    id: "anomalyHigh",
    label: CRITERION_LABEL.anomalyHigh,
    pass: !anomaly.enabled || !high,
    detail: high ? "El mensaje pide un cambio de cuenta o muestra riesgo alto." : `Riesgo ${jev.socialEngineeringRisk.score}.`,
    action: anomaly.enabled && high ? anomaly.action : null,
  });

  const coherenceOk =
    jev.contractCoherence.answer === true && jev.contractCoherence.probability >= rules.jevConfidenceThreshold;
  const contract = criterionOf(rules, "contract");
  rows.push({
    id: "contract",
    label: CRITERION_LABEL.contract,
    pass: !contract.enabled || coherenceOk,
    detail: coherenceOk
      ? "El concepto encaja con el contrato al umbral vigente."
      : "JEV no confirma que el concepto corresponda al contrato.",
    action: contract.enabled && !coherenceOk ? contract.action : null,
  });

  const unique =
    jev.semanticDuplicate.answer === false &&
    jev.semanticDuplicate.probability >= rules.semanticDuplicateMinProbability;
  const semantic = criterionOf(rules, "semanticDuplicate");
  rows.push({
    id: "semanticDuplicate",
    label: CRITERION_LABEL.semanticDuplicate,
    pass: !semantic.enabled || unique,
    detail: unique
      ? "No se detectó el mismo servicio o entregable para el mismo periodo en otra factura."
      : "JEV detectó un posible cobro repetido: el servicio o entregable y el periodo coinciden con otra factura.",
    action: semantic.enabled && !unique ? semantic.action : null,
  });

  return rows;
}
