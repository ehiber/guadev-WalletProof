import { criterionEnabled, criterionOf } from "@/lib/engine/criteria";
import { sha256Hex } from "@/lib/engine/sha256";
import { findVendor } from "@/lib/mock-data/company-rules";
import { lookupFx } from "@/lib/mock-data/fx-ledger";
import type {
  CompanyRules,
  CriterionAction,
  CriterionId,
  DecisionStatus,
  FxRate,
  HardRulesResult,
  Invoice,
  JevResult,
  PriorDocument,
} from "@/types/blinka";

export function toUsd(totalPayable: number, rateToUsd: number): number {
  return Number((totalPayable / rateToUsd).toFixed(2));
}

export function evaluateHardRules(
  invoice: Invoice,
  rules: CompanyRules,
  priors: PriorDocument[],
  currentPeriodSpentUsd: number,
): { hard: HardRulesResult; fxSnapshot: FxRate | null } {
  if (invoice.extractionValid === false) {
    const isExactDuplicate = priors.some(
      (prior) =>
        (prior.invoiceNumber === invoice.invoiceNumber && prior.vendorId === invoice.vendorId) ||
        prior.documentHash === invoice.documentHash,
    );
    const reasons = [invoice.extractionNote?.trim() || "Faltan campos obligatorios."];
    if (isExactDuplicate) reasons.push("Duplicado exacto: misma referencia y proveedor, o mismo hash de documento.");
    return {
      fxSnapshot: null,
      hard: {
        passed: false,
        extractionValid: false,
        isExactDuplicate,
        isVendorWhitelisted: false,
        fxValid: false,
        isWithinSingleLimit: false,
        isWithinPeriodBudget: true,
        totalPayableUsd: 0,
        currentPeriodSpentUsd,
        reasons,
      },
    };
  }

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
  const duplicateCounts = criterionEnabled(rules, "duplicate") && isExactDuplicate;
  const whitelistCounts = criterionEnabled(rules, "whitelist") && !isVendorWhitelisted;
  const limitCounts = criterionEnabled(rules, "limit") && !isWithinSingleLimit;
  const budgetCounts = criterionEnabled(rules, "budget") && !isWithinPeriodBudget;
  const lineCounts = criterionEnabled(rules, "lineCheck") && Boolean(invoice.lineCheck);
  const reasons: string[] = [];

  if (!fxValid) reasons.push(`No hay tasa FX auditada para ${invoice.currency} el ${invoice.issueDate}.`);
  if (lineCounts && invoice.lineCheck) reasons.push(invoice.lineCheck);
  if (duplicateCounts) reasons.push("Duplicado exacto: misma referencia y proveedor, o mismo hash de documento.");
  if (whitelistCounts) reasons.push("El proveedor no está activo en la whitelist.");
  if (limitCounts) reasons.push("El total a pagar en USD supera el límite automático.");
  if (budgetCounts) reasons.push("El total no cabe en el presupuesto restante del periodo.");

  const passed = fxValid && !duplicateCounts && !whitelistCounts && !limitCounts && !budgetCounts && !lineCounts;

  return {
    fxSnapshot,
    hard: {
      passed,
      ...(invoice.lineCheck ? { lineCheck: true } : {}),
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

function consider(
  failures: CriterionAction[],
  rules: CompanyRules,
  id: CriterionId,
  failed: boolean,
) {
  if (!failed || !criterionEnabled(rules, id)) return;
  failures.push(criterionOf(rules, id).action);
}

function fromFailures(failures: CriterionAction[]): DecisionStatus | null {
  if (failures.includes("BLOCKED")) return "BLOCKED";
  if (failures.length > 0) return "ESCALATED";
  return null;
}

export function decideStatus(hard: HardRulesResult, jev: JevResult | null, rules: CompanyRules): DecisionStatus {
  if (hard.extractionValid === false || !hard.fxValid) return "BLOCKED";

  const hardFailures: CriterionAction[] = [];
  consider(hardFailures, rules, "duplicate", hard.isExactDuplicate);
  consider(hardFailures, rules, "budget", !hard.isWithinPeriodBudget);
  consider(hardFailures, rules, "whitelist", !hard.isVendorWhitelisted);
  consider(hardFailures, rules, "limit", !hard.isWithinSingleLimit);
  consider(hardFailures, rules, "lineCheck", hard.lineCheck === true);
  const hardStatus = fromFailures(hardFailures);
  if (hardStatus) return hardStatus;

  if (!jev) return "ESCALATED";
  if (jev.socialEngineeringRisk.score === "MEDIUM") return "ESCALATED";
  if (jev.socialEngineeringRisk.score === "HIGH") {
    const anomaly = criterionOf(rules, "anomalyHigh");
    if (anomaly.enabled) return anomaly.action;
  }

  const coherenceOk =
    jev.contractCoherence.answer === true && jev.contractCoherence.probability >= rules.jevConfidenceThreshold;
  const notSemanticDuplicate =
    jev.semanticDuplicate.answer === false &&
    jev.semanticDuplicate.probability >= rules.semanticDuplicateMinProbability;
  const jevFailures: CriterionAction[] = [];
  consider(jevFailures, rules, "contract", !coherenceOk);
  consider(jevFailures, rules, "semanticDuplicate", !notSemanticDuplicate);
  return fromFailures(jevFailures) ?? "APPROVED";
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
