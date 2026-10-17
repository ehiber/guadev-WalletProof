export type DecisionStatus = "APPROVED" | "ESCALATED" | "BLOCKED";

export type Currency = "USD" | "COP" | "MXN" | "VES" | "ARS";

export type AnomalyScore = "LOW" | "MEDIUM" | "HIGH";

export type CostCenter =
  | "Cloud & Infra"
  | "Marketing & Growth"
  | "Software Development"
  | "Legal & Admin"
  | "Facilities & Maintenance"
  | "Other";

export type DocumentKind = "pdf" | "handwritten" | "thermal" | "chat";

export interface CompanyRules {
  maxAutoApproveUsd: number;
  monthlyBudgetUsd: number;
  jevConfidenceThreshold: number;
  semanticDuplicateMinProbability: number;
}

export interface FxRate {
  date: string;
  currency: Currency;
  rateToUsd: number;
  source: string;
}

export interface Vendor {
  id: string;
  legalName: string;
  country: string;
  active: boolean;
  contractSummary: string;
  costCenter: CostCenter;
  bankAccountLast4: string;
}

export interface NoulAnswer {
  answer: boolean;
  probability: number;
}

export interface JevResult {
  contractCoherence: NoulAnswer;
  semanticDuplicate: NoulAnswer;
  socialEngineeringRisk: { score: AnomalyScore; probability: number };
  costCenter: { choice: CostCenter; probability: number };
  latencyMs: number;
  source: "snapshot" | "live";
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  vendorId: string;
  vendorName: string;
  issueDate: string;
  currency: Currency;
  subtotal: number;
  taxAmount: number;
  totalPayable: number;
  documentHash: string;
  description: string;
  documentKind: DocumentKind;
  documentLabel: string;
  documentPath: string;
  periodKey: string;
  lineItems: string[];
  evidenceNote: string;
  jevSnapshot: JevResult;
}

export interface HardRulesResult {
  passed: boolean;
  isExactDuplicate: boolean;
  isVendorWhitelisted: boolean;
  fxValid: boolean;
  isWithinSingleLimit: boolean;
  isWithinPeriodBudget: boolean;
  totalPayableUsd: number;
  currentPeriodSpentUsd: number;
  reasons: string[];
}

export interface AuditRecord {
  invoiceId: string;
  totalPayableUsd: number;
  rulesSnapshot: CompanyRules;
  fxSnapshot: FxRate | null;
  hardRulesResult: HardRulesResult;
  jevResult: JevResult | null;
  finalStatus: DecisionStatus;
  auditHash: string;
  explanation: string;
}

export interface PriorDocument {
  invoiceNumber: string;
  vendorId: string;
  documentHash: string;
}
