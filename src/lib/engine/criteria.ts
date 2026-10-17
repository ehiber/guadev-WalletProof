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
  "budget",
  "anomalyHigh",
  "whitelist",
  "limit",
  "lineCheck",
  "contract",
  "semanticDuplicate",
];

export const CRITERION_LABEL: Record<CriterionId, string> = {
  duplicate: "Sin cobros duplicados",
  budget: "Presupuesto suficiente",
  anomalyHigh: "Anomalía alta o cuenta distinta",
  whitelist: "Proveedor autorizado",
  limit: "Total dentro del límite automático",
  lineCheck: "Coherencia aritmética de líneas",
  contract: "Concepto acorde con el servicio",
  semanticDuplicate: "Sin duplicado semántico",
};

export const DEFAULT_CRITERIA: RuleCriterion[] = [
  { id: "duplicate", action: "BLOCKED", enabled: true },
  { id: "budget", action: "BLOCKED", enabled: true },
  { id: "anomalyHigh", action: "BLOCKED", enabled: true },
  { id: "whitelist", action: "ESCALATED", enabled: true },
  { id: "limit", action: "ESCALATED", enabled: true },
  { id: "lineCheck", action: "ESCALATED", enabled: true },
  { id: "contract", action: "ESCALATED", enabled: true },
  { id: "semanticDuplicate", action: "ESCALATED", enabled: true },
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
      return found ? { id: item.id, action: found.action, enabled: found.enabled } : { ...item };
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
      label: "Tasa FX auditada",
      pass: hard.fxValid,
      detail: record.fxSnapshot
        ? `1 USD = ${record.fxSnapshot.rateToUsd} ${record.fxSnapshot.currency} · ${record.fxSnapshot.date}`
        : `No hay tasa para ${invoice.currency} el ${invoice.issueDate}.`,
      action: hard.fxValid ? null : "PERMANENT",
    },
  ];

  const hardRows: Array<{ id: CriterionId; pass: boolean; detail: string }> = [
    {
      id: "duplicate",
      pass: !hard.isExactDuplicate,
      detail: hard.isExactDuplicate ? "Misma referencia y proveedor, o mismo hash." : "Sin coincidencia exacta en este lote.",
    },
    {
      id: "budget",
      pass: hard.isWithinPeriodBudget,
      detail: `${hard.totalPayableUsd.toFixed(2)} USD frente al saldo del periodo.`,
    },
    {
      id: "whitelist",
      pass: hard.isVendorWhitelisted,
      detail: hard.isVendorWhitelisted ? "El proveedor está activo." : "El proveedor no está activo en la lista.",
    },
    {
      id: "limit",
      pass: hard.isWithinSingleLimit,
      detail: `${hard.totalPayableUsd.toFixed(2)} USD frente al tope de ${rules.maxAutoApproveUsd.toFixed(2)} USD.`,
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
      action: criterion.enabled && !row.pass ? criterion.action : null,
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
    detail: unique ? "No parece el mismo entregable de una factura previa." : "JEV marca un posible duplicado semántico.",
    action: semantic.enabled && !unique ? semantic.action : null,
  });

  return rows;
}
