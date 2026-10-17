import { findVendor } from "@/lib/mock-data/company-rules";
import { lookupFx } from "@/lib/mock-data/fx-ledger";
import type {
  CompanyRules,
  DecisionStatus,
  FxRate,
  HardRulesResult,
  Invoice,
  JevResult,
  PriorDocument,
} from "@/types/blinka";
import { sha256Hex } from "@/lib/engine/sha256";

export function toUsd(totalPayable: number, rateToUsd: number): number {
  return Number((totalPayable / rateToUsd).toFixed(2));
}

export function evaluateHardRules(
  invoice: Invoice,
  rules: CompanyRules,
  priors: PriorDocument[],
  currentPeriodSpentUsd: number,
): { hard: HardRulesResult; fxSnapshot: FxRate | null } {
  const fxSnapshot = lookupFx(invoice.issueDate, invoice.currency);
  const fxValid = fxSnapshot !== null && fxSnapshot.rateToUsd > 0;
  const totalPayableUsd = fxValid ? toUsd(invoice.totalPayable, fxSnapshot.rateToUsd) : 0;
  const isExactDuplicate = priors.some(
    (prior) =>
      (prior.invoiceNumber === invoice.invoiceNumber && prior.vendorId === invoice.vendorId) ||
      prior.documentHash === invoice.documentHash,
  );
  const isVendorWhitelisted = findVendor(invoice.vendorId)?.active === true;
  const isWithinSingleLimit = totalPayableUsd <= rules.maxAutoApproveUsd;
  const isWithinPeriodBudget =
    Number((currentPeriodSpentUsd + totalPayableUsd).toFixed(2)) <= rules.monthlyBudgetUsd;
  const reasons: string[] = [];

  if (!fxValid) reasons.push("No hay tasa FX auditada para la fecha y la moneda.");
  if (isExactDuplicate) reasons.push("Duplicado exacto: misma referencia y proveedor, o mismo hash de documento.");
  if (!isVendorWhitelisted) reasons.push("El proveedor no está activo en la whitelist.");
  if (!isWithinSingleLimit) reasons.push("El total a pagar en USD supera el límite automático.");
  if (!isWithinPeriodBudget) reasons.push("El total no cabe en el presupuesto restante del periodo.");

  const passed =
    fxValid && !isExactDuplicate && isVendorWhitelisted && isWithinSingleLimit && isWithinPeriodBudget;

  return {
    fxSnapshot,
    hard: {
      passed,
      isExactDuplicate,
      isVendorWhitelisted,
      fxValid,
      isWithinSingleLimit,
      isWithinPeriodBudget,
      totalPayableUsd,
      currentPeriodSpentUsd,
      reasons,
    },
  };
}

export function decideStatus(hard: HardRulesResult, jev: JevResult | null, rules: CompanyRules): DecisionStatus {
  if (hard.isExactDuplicate || !hard.fxValid || !hard.isWithinPeriodBudget) return "BLOCKED";
  if (!hard.isVendorWhitelisted || !hard.isWithinSingleLimit) return "ESCALATED";
  if (!jev) return "ESCALATED";
  if (jev.socialEngineeringRisk.score === "HIGH") return "BLOCKED";

  const coherenceOk =
    jev.contractCoherence.answer === true &&
    jev.contractCoherence.probability >= rules.jevConfidenceThreshold;
  const notSemanticDuplicate =
    jev.semanticDuplicate.answer === false &&
    jev.semanticDuplicate.probability >= rules.semanticDuplicateMinProbability;
  const lowAnomaly = jev.socialEngineeringRisk.score === "LOW";

  if (coherenceOk && notSemanticDuplicate && lowAnomaly) return "APPROVED";
  return "ESCALATED";
}

export function buildAuditHash(input: {
  invoiceId: string;
  totalPayableUsd: number;
  rulesSnapshot: CompanyRules;
  fxSnapshot: FxRate | null;
  hardRulesResult: HardRulesResult;
  jevResult: JevResult | null;
  finalStatus: DecisionStatus;
}): string {
  return sha256Hex(
    JSON.stringify({
      invoiceId: input.invoiceId,
      totalPayableUsd: input.totalPayableUsd,
      rulesSnapshot: input.rulesSnapshot,
      fxSnapshot: input.fxSnapshot,
      hardRulesResult: input.hardRulesResult,
      jevResult: input.jevResult,
      finalStatus: input.finalStatus,
    }),
  );
}
