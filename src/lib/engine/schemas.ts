import { isPayableCurrency } from "@/lib/engine/currency";
import { normalizeRules } from "@/lib/engine/criteria";
import type { CompanyRules, Invoice } from "@/types/blinka";
import { z } from "zod";

const criterionIds = [
  "duplicate",
  "budget",
  "anomalyHigh",
  "whitelist",
  "limit",
  "lineCheck",
  "contract",
  "semanticDuplicate",
] as const;

export const rulesSchema = z.object({
  maxAutoApproveUsd: z.number().positive(),
  monthlyBudgetUsd: z.number().positive(),
  jevConfidenceThreshold: z.number().min(0.5).max(0.99),
  semanticDuplicateMinProbability: z.number().min(0).max(1),
  criteria: z
    .array(
      z.object({
        id: z.enum(criterionIds),
        action: z.enum(["ESCALATED", "BLOCKED"]),
        enabled: z.boolean(),
      }),
    )
    .optional(),
});

export const invoiceSchema = z.object({
  id: z.string().min(1),
  invoiceNumber: z.string().min(1),
  vendorId: z.string().min(1),
  vendorName: z.string().min(1),
  issueDate: z.string().min(1),
  currency: z.string().regex(/^[A-Z]{3,5}$/).refine(isPayableCurrency),
  subtotal: z.number(),
  taxAmount: z.number(),
  totalPayable: z.number(),
  documentHash: z.string().min(1),
  description: z.string(),
  documentKind: z.enum(["pdf", "handwritten", "thermal", "chat"]),
  documentLabel: z.string(),
  intakeChannel: z.enum(["dataset", "email", "chat", "upload"]).optional(),
  documentPath: z.string(),
  periodKey: z.string(),
  lineItems: z.array(z.string()),
  evidenceNote: z.string(),
  extractionValid: z.boolean().optional(),
  extractionNote: z.string().optional(),
  lineCheck: z.string().optional(),
  jevSnapshot: z
    .object({
      contractCoherence: z.object({ answer: z.boolean(), probability: z.number() }),
      semanticDuplicate: z.object({ answer: z.boolean(), probability: z.number() }),
      socialEngineeringRisk: z.object({
        score: z.enum(["LOW", "MEDIUM", "HIGH"]),
        probability: z.number(),
      }),
      costCenter: z.object({
        choice: z.enum([
          "Cloud & Infra",
          "Marketing & Growth",
          "Software Development",
          "Legal & Admin",
          "Facilities & Maintenance",
          "Other",
        ]),
        probability: z.number(),
      }),
      latencyMs: z.number(),
      source: z.enum(["snapshot", "live"]),
    })
    .nullable(),
});

export function parseRules(value: unknown): CompanyRules | null {
  const parsed = rulesSchema.safeParse(value);
  return parsed.success ? normalizeRules(parsed.data) : null;
}

export function parseInvoices(value: unknown): Invoice[] | null {
  const parsed = z.array(invoiceSchema).max(24).safeParse(value);
  return parsed.success ? (parsed.data as Invoice[]) : null;
}
