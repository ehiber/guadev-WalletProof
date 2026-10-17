import { findVendor } from "@/lib/mock-data/company-rules";
import type { ByokKeys } from "@/lib/engine/model-provider";
import type { AnomalyScore, CostCenter, Invoice, JevResult } from "@/types/blinka";
import { z } from "zod";

const scoreSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
const COST_CENTERS = [
  "Cloud & Infra",
  "Marketing & Growth",
  "Software Development",
  "Legal & Admin",
  "Facilities & Maintenance",
  "Other",
] as const;

const jevSchema = z.object({
  contractCoherence: z.object({ answer: z.boolean(), probability: z.number() }),
  semanticDuplicate: z.object({ answer: z.boolean(), probability: z.number() }),
  socialEngineeringRisk: z.object({ score: scoreSchema, probability: z.number() }),
  costCenter: z.object({ choice: z.enum(COST_CENTERS), probability: z.number() }),
});

export interface JevRun {
  result: JevResult;
  mode: "live" | "fallback";
  raw: unknown;
  error?: string;
}

function questions(invoice: Invoice, recent: Invoice[]) {
  const vendor = findVendor(invoice.vendorId);
  return {
    context: {
      invoice: {
        id: invoice.id,
        description: invoice.description,
        lineItems: invoice.lineItems,
        evidenceNote: invoice.evidenceNote,
        totalPayable: invoice.totalPayable,
        currency: invoice.currency,
      },
      contract: vendor?.contractSummary ?? "Sin contrato.",
      bankAccountLast4: vendor?.bankAccountLast4 ?? null,
      recentInvoices: recent.slice(-5).map((item) => ({
        id: item.id,
        invoiceNumber: item.invoiceNumber,
        description: item.description,
        periodKey: item.periodKey,
      })),
    },
    questions: [
      {
        id: "Q1_CONTRACT_COHERENCE",
        type: "noul",
        prompt:
          "¿El concepto y los ítems cobrados en esta factura corresponden semánticamente al giro y servicios acordados en el contrato de este proveedor?",
      },
      {
        id: "Q2_SEMANTIC_DUPLICATE",
        type: "noul",
        prompt:
          "¿Esta factura cobra exactamente el mismo entregable y periodo que alguna de las facturas previas registradas para este proveedor, aunque use diferente redacción o formato?",
      },
      {
        id: "Q3_ANOMALY_SCORE",
        type: "score",
        options: ["LOW", "MEDIUM", "HIGH"],
        prompt:
          "¿Qué nivel de riesgo de manipulación, urgencia atípica o cambio no autorizado de datos bancarios presenta el documento o mensaje adjunto?",
      },
      {
        id: "Q4_COST_CENTER",
        type: "choice",
        options: [...COST_CENTERS],
        prompt: "¿A qué partida presupuestaria pertenece este gasto?",
      },
    ],
  };
}

export async function evaluateJev(invoice: Invoice, recent: Invoice[], keys: ByokKeys): Promise<JevRun> {
  const snapshot: JevResult = { ...invoice.jevSnapshot, source: "snapshot" };
  if (!keys.jev) {
    return {
      result: snapshot,
      mode: "fallback",
      raw: { reason: "Sin TYPESAFE_JEV_KEY. Se conserva el snapshot JEV." },
    };
  }

  const started = performance.now();
  const endpoint = process.env.TYPESAFE_JEV_URL ?? "https://api.typesafe.ai/v1/system1/evaluate";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${keys.jev}`,
      },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify(questions(invoice, recent)),
    });
    if (!response.ok) throw new Error(`JEV respondió ${response.status}`);
    const raw = await response.json();
    const parsed = jevSchema.safeParse(raw);
    if (!parsed.success) throw new Error("La respuesta de JEV no trae Noul, Score y Choice.");
    const result: JevResult = {
      contractCoherence: parsed.data.contractCoherence,
      semanticDuplicate: parsed.data.semanticDuplicate,
      socialEngineeringRisk: {
        score: parsed.data.socialEngineeringRisk.score as AnomalyScore,
        probability: parsed.data.socialEngineeringRisk.probability,
      },
      costCenter: {
        choice: parsed.data.costCenter.choice as CostCenter,
        probability: parsed.data.costCenter.probability,
      },
      latencyMs: Math.round(performance.now() - started),
      source: "live",
    };
    return { result, mode: "live", raw };
  } catch (error) {
    return {
      result: snapshot,
      mode: "fallback",
      raw: { reason: error instanceof Error ? error.message : "Fallo de JEV" },
      error: error instanceof Error ? error.message : "Fallo de JEV",
    };
  }
}
