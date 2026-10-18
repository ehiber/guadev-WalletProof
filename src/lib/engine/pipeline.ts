import { buildAuditHash, decideStatus, evaluateHardRules } from "@/lib/engine/2-hard-rules";
import type { FxOverride } from "@/lib/engine/fx-overrides";
import type { AuditRecord, CompanyRules, FxRate, Invoice, JevResult, PriorDocument } from "@/types/blinka";

function explain(record: Omit<AuditRecord, "explanation" | "auditHash">): string {
  const usd = record.totalPayableUsd.toFixed(2);
  if (record.hardRulesResult.extractionValid === false) {
    return `Bloqueado. ${record.hardRulesResult.reasons[0] ?? "Faltan campos obligatorios."}`;
  }
  if (!record.hardRulesResult.fxValid) {
    const lead = record.finalStatus === "BLOCKED" ? "Rechazado" : "Por revisar";
    const reason = record.hardRulesResult.reasons.find((item) => item.startsWith("No hay tasa")) ?? "No hay tasa para el día de pago.";
    return `${lead}. ${reason}`;
  }
  if (record.finalStatus === "APPROVED") {
    return `Aprobado en automático. El total equivalente es ${usd} USD, el proveedor está autorizado y las reglas duras y JEV coinciden.`;
  }
  if (record.finalStatus === "BLOCKED") {
    if (record.jevResult?.socialEngineeringRisk.score === "HIGH") {
      return `Rechazado por JEV. El mensaje tiene riesgo alto de manipulación o cambio de cuenta. Total equivalente: ${usd} USD.`;
    }
    if (record.hardRulesResult.reasons.length > 0) {
      return `Rechazado. ${record.hardRulesResult.reasons.join(" ")} Total equivalente: ${usd} USD.`;
    }
    return `Rechazado por un criterio configurado para frenar el pago. Total equivalente: ${usd} USD.`;
  }
  if (record.hardRulesResult.reasons.length > 0 && !record.hardRulesResult.passed) {
    return `Por revisar. ${record.hardRulesResult.reasons.join(" ")} Total equivalente: ${usd} USD.`;
  }
  if (record.jevResult?.socialEngineeringRisk.score === "HIGH") {
    return `Por revisar. El mensaje tiene riesgo alto de manipulación o cambio de cuenta. Total equivalente: ${usd} USD.`;
  }
  if (record.hardRulesResult.passed && !record.jevResult) {
    return `Por revisar. JEV no se consultó. Total equivalente: ${usd} USD.`;
  }
  return `Por revisar. JEV no confirma coherencia, unicidad y riesgo bajo al umbral vigente. Total equivalente: ${usd} USD.`;
}

export function evaluateInvoice(
  invoice: Invoice,
  rules: CompanyRules,
  priors: PriorDocument[],
  currentPeriodSpentUsd: number,
  jev: JevResult | null = invoice.jevSnapshot,
  overrides: FxOverride[] = [],
  asOf?: string,
  market?: FxRate[],
  settled?: FxRate | null,
): AuditRecord {
  const { hard, fxSnapshot } = evaluateHardRules(invoice, rules, priors, currentPeriodSpentUsd, overrides, asOf, market, settled);
  const jevResult = hard.passed ? jev : null;
  const finalStatus = decideStatus(hard, jevResult, rules);
  const rulesSnapshot: CompanyRules = { ...rules };
  const draft = {
    invoiceId: invoice.id,
    totalPayableUsd: hard.totalPayableUsd,
    rulesSnapshot,
    fxSnapshot,
    hardRulesResult: hard,
    jevResult,
    finalStatus,
  };
  return {
    ...draft,
    auditHash: buildAuditHash(draft),
    explanation: explain(draft),
  };
}

export function evaluateBatch(
  invoices: Invoice[],
  rules: CompanyRules,
  overrides: FxOverride[] = [],
  asOf?: string,
  market?: FxRate[],
  settled?: Record<string, FxRate>,
): AuditRecord[] {
  const priors: PriorDocument[] = [];
  let spent = 0;
  const records: AuditRecord[] = [];

  for (const invoice of invoices) {
    const record = evaluateInvoice(invoice, rules, priors, spent, invoice.jevSnapshot, overrides, asOf, market, settled?.[invoice.id]);
    records.push(record);
    priors.push({
      invoiceNumber: invoice.invoiceNumber,
      vendorId: invoice.vendorId,
      documentHash: invoice.documentHash,
    });
    if (record.finalStatus === "APPROVED") {
      spent = Number((spent + record.totalPayableUsd).toFixed(2));
    }
  }

  return records;
}
