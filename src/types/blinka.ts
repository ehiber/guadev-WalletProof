export type DecisionStatus = "APPROVED" | "ESCALATED" | "BLOCKED";

export type Currency = string;

export type AnomalyScore = "LOW" | "MEDIUM" | "HIGH";

export type CostCenter =
  | "Cloud & Infra"
  | "Marketing & Growth"
  | "Software Development"
  | "Legal & Admin"
  | "Facilities & Maintenance"
  | "Other";

export type DocumentKind = "pdf" | "handwritten" | "thermal" | "chat";

export type IntakeChannel = "dataset" | "email" | "chat" | "upload";

export type CriterionAction = "ESCALATED" | "BLOCKED";

export type CriterionId =
  | "duplicate"
  | "budget"
  | "anomalyHigh"
  | "whitelist"
  | "project"
  | "projectVendor"
  | "fx"
  | "limit"
  | "lineCheck"
  | "contract"
  | "semanticDuplicate";

export interface RuleCriterion {
  id: CriterionId;
  action: CriterionAction;
  enabled: boolean;
}

export interface ProjectCriterionOverride {
  action?: CriterionAction;
  enabled?: boolean;
}

export interface ProjectRules {
  maxAutoApproveUsd?: number;
  monthlyBudgetUsd?: number;
  jevConfidenceThreshold?: number;
  semanticDuplicateMinProbability?: number;
  criteria?: Partial<Record<CriterionId, ProjectCriterionOverride>>;
}

export interface Project {
  id: string;
  name: string;
  code: string;
  status: "active" | "archived";
  description?: string;
  vendorListName?: string;
  /** Mes del presupuesto, `YYYY-MM`. */
  budgetMonth?: string;
  currencies?: string[];
  vendorIds: string[];
  rules: ProjectRules;
}

export interface NewProjectInput {
  name: string;
  code: string;
  description?: string;
  vendorListName?: string;
  budgetMonth?: string;
  currencies?: string[];
  vendorIds?: string[];
  monthlyBudgetUsd?: number;
}

export interface CompanyRules {
  maxAutoApproveUsd: number;
  monthlyBudgetUsd: number;
  jevConfidenceThreshold: number;
  semanticDuplicateMinProbability: number;
  criteria: RuleCriterion[];
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

export interface ProjectAssignment {
  projectId: string;
  method: "explicit-reference" | "unique-eligibility";
  evidence: string;
}

export interface BankAccountCheck {
  requested: string;
  registered: string[];
  matches: boolean;
}

export interface Invoice {
  id: string;
  projectId?: string;
  projectReference?: string;
  projectAssignment?: ProjectAssignment;
  paymentAccountIdentifier?: string;
  bankAccountCheck?: BankAccountCheck;
  invoiceNumber: string;
  vendorId: string;
  vendorName: string;
  issueDate: string;
  receivedAt?: string;
  currency: Currency;
  subtotal: number;
  taxAmount: number;
  totalPayable: number;
  documentHash: string;
  description: string;
  documentKind: DocumentKind;
  documentLabel: string;
  intakeChannel?: IntakeChannel;
  documentPath: string;
  periodKey: string;
  lineItems: string[];
  evidenceNote: string;
  extractionValid?: boolean;
  extractionNote?: string;
  lineCheck?: string;
  jevSnapshot: JevResult | null;
}

export interface HardRulesResult {
  passed: boolean;
  extractionValid?: boolean;
  lineCheck?: boolean;
  isExactDuplicate: boolean;
  isVendorWhitelisted: boolean;
  hasProject: boolean;
  isVendorOnProject: boolean;
  bankAccountMatches?: boolean;
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
