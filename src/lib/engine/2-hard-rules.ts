import { criterionEnabled, criterionOf } from "@/lib/engine/criteria";
import { resolveFx, type FxOverride } from "@/lib/engine/fx-overrides";
import type { ProjectScope } from "@/lib/mock-data/projects";
import { paymentDate } from "@/lib/mock-data/fx-ledger";
import { sha256Hex } from "@/lib/engine/sha256";
import { findVendor } from "@/lib/mock-data/company-rules";
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
  overrides: FxOverride[] = [],
  asOf = paymentDate(),
  market?: FxRate[],
  settled?: FxRate | null,
  scope?: ProjectScope,
  activeVendors?: Readonly<Record<string, boolean>>,
): { hard: HardRulesResult; fxSnapshot: FxRate | null } {
  if (invoice.extractionValid === false) {
    const isExactDuplicate = priors.some(
      (prior) =>
        (prior.invoiceNumber === invoice.invoiceNumber && prior.vendorId === invoice.vendorId) ||
        prior.documentHash === invoice.documentHash,
    );
    const reasons = [invoice.extractionNote?.trim() || "Faltan campos obligatorios."];
    if (isExactDuplicate) reasons.push("Documento duplicado: mismo número y proveedor, o mismo archivo.");
    return {
      fxSnapshot: null,
      hard: {
        passed: false,
        extractionValid: false,
        isExactDuplicate,
        isVendorWhitelisted: false,
        hasProject: true,
        isVendorOnProject: true,
        fxValid: false,
        isWithinSingleLimit: false,
        isWithinPeriodBudget: true,
        totalPayableUsd: 0,
        currentPeriodSpentUsd,
        reasons,
      },
    };
  }

  const fxSnapshot = resolveFx(invoice, overrides, asOf, market, settled);
  const fxValid = fxSnapshot !== null && fxSnapshot.rateToUsd > 0;
  const totalPayableUsd = fxValid ? toUsd(invoice.totalPayable, fxSnapshot.rateToUsd) : 0;
  const isExactDuplicate = priors.some(
    (prior) =>
      (prior.invoiceNumber === invoice.invoiceNumber && prior.vendorId === invoice.vendorId) ||
      prior.documentHash === invoice.documentHash,
  );
  const listed = activeVendors?.[invoice.vendorId];
  const isVendorWhitelisted = listed ?? findVendor(invoice.vendorId)?.active === true;
  const isWithinSingleLimit = !fxValid || totalPayableUsd <= rules.maxAutoApproveUsd;
  const withinCompanyBudget =
    !fxValid || Number((currentPeriodSpentUsd + totalPayableUsd).toFixed(2)) <= rules.monthlyBudgetUsd;
  const projectBudgetUsd = scope?.projectBudgetUsd;
  const withinProjectBudget =
    projectBudgetUsd == null ||
    !fxValid ||
    Number(((scope?.projectSpentUsd ?? 0) + totalPayableUsd).toFixed(2)) <= projectBudgetUsd;
  const isWithinPeriodBudget = withinCompanyBudget && withinProjectBudget;
  const hasProject = scope ? scope.assigned : true;
  const isVendorOnProject = scope ? !scope.assigned || scope.vendorOnProject : true;
  const bankAccountMatches = invoice.bankAccountCheck?.matches;
  const duplicateCounts = criterionEnabled(rules, "duplicate") && isExactDuplicate;
  const whitelistCounts = criterionEnabled(rules, "whitelist") && !isVendorWhitelisted;
  const limitCounts = criterionEnabled(rules, "limit") && fxValid && !isWithinSingleLimit;
  const budgetCounts = criterionEnabled(rules, "budget") && fxValid && !isWithinPeriodBudget;
  const projectCounts = Boolean(scope) && criterionEnabled(rules, "project") && !hasProject;
  const projectVendorCounts = Boolean(scope) && criterionEnabled(rules, "projectVendor") && hasProject && !isVendorOnProject;
  const lineCounts = criterionEnabled(rules, "lineCheck") && Boolean(invoice.lineCheck);
  const fxCounts = criterionEnabled(rules, "fx") && !fxValid;
  const bankCounts = criterionEnabled(rules, "anomalyHigh") && bankAccountMatches === false;
  const reasons: string[] = [];

  if (fxCounts) reasons.push(`No hay tasa para ${invoice.currency} el ${asOf}.`);
  if (lineCounts && invoice.lineCheck) reasons.push(invoice.lineCheck);
  if (duplicateCounts) reasons.push("Documento duplicado: mismo número y proveedor, o mismo archivo.");
  if (whitelistCounts) reasons.push("El proveedor no está activo en la whitelist.");
  if (projectCounts) reasons.push("La factura no tiene proyecto.");
  if (projectVendorCounts) reasons.push("El proveedor no está asignado a este proyecto.");
  if (limitCounts) reasons.push("El total a pagar en USD supera el límite automático.");
  if (budgetCounts && !withinCompanyBudget) reasons.push("El total no cabe en el presupuesto restante del periodo.");
  if (budgetCounts && !withinProjectBudget) reasons.push("El total no cabe en el presupuesto del proyecto.");
  if (bankCounts) reasons.push("La cuenta indicada para el pago no coincide con ninguna cuenta registrada del proveedor.");

  const passed =
    fxValid &&
    !duplicateCounts &&
    !whitelistCounts &&
    !projectCounts &&
    !projectVendorCounts &&
    !limitCounts &&
    !budgetCounts &&
    !lineCounts &&
    !bankCounts;

  return {
    fxSnapshot,
    hard: {
      passed,
      ...(invoice.lineCheck ? { lineCheck: true } : {}),
      isExactDuplicate,
      isVendorWhitelisted,
      hasProject,
      isVendorOnProject,
      bankAccountMatches,
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
  if (hard.extractionValid === false) return "BLOCKED";

  const hardFailures: CriterionAction[] = [];
  consider(hardFailures, rules, "fx", !hard.fxValid);
  consider(hardFailures, rules, "duplicate", hard.isExactDuplicate);
  consider(hardFailures, rules, "budget", !hard.isWithinPeriodBudget);
  consider(hardFailures, rules, "whitelist", !hard.isVendorWhitelisted);
  consider(hardFailures, rules, "project", !hard.hasProject);
  consider(hardFailures, rules, "projectVendor", hard.hasProject && !hard.isVendorOnProject);
  consider(hardFailures, rules, "limit", !hard.isWithinSingleLimit);
  consider(hardFailures, rules, "lineCheck", hard.lineCheck === true);
  consider(hardFailures, rules, "anomalyHigh", hard.bankAccountMatches === false);
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
