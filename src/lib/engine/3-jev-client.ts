import { findVendor } from "@/lib/mock-data/company-rules";
import type { ByokKeys } from "@/lib/engine/model-provider";
import type { AnomalyScore, CostCenter, Invoice, JevResult, NoulAnswer } from "@/types/blinka";
import { z } from "zod";

const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-latest";

const ANOMALY_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;

const COST_CENTERS = [
  "Cloud & Infra",
  "Marketing & Growth",
  "Software Development",
  "Legal & Admin",
  "Facilities & Maintenance",
  "Other",
] as const;

const probabilityMap = z.record(z.string(), z.number());

const systemOneSchema = z.object({
  answers: z.object({
    Q1_CONTRACT_COHERENCE: z.object({
      type: z.literal("noul"),
      noul: z.number().min(0).max(1),
    }),
    Q2_SEMANTIC_DUPLICATE: z.object({
      type: z.literal("noul"),
      noul: z.number().min(0).max(1),
    }),
    Q3_ANOMALY_SCORE: z.object({
      type: z.literal("score"),
      score: z.number().finite(),
      probabilities: probabilityMap,
    }),
    Q4_COST_CENTER: z.object({
      type: z.literal("choice"),
      choice: z.enum(COST_CENTERS),
      probabilities: probabilityMap,
    }),
  }),
});

export interface JevRun {
  result: JevResult | null;
  mode: "live" | "fallback";
  raw: unknown;
  error?: string;
}

function noulAnswer(noul: number): NoulAnswer {
  const yes = noul >= 0.5;
  return { answer: yes, probability: yes ? noul : 1 - noul };
}

function anomalyFromScore(score: number, probabilities: Record<string, number>): { score: AnomalyScore; probability: number } {
  const present = ANOMALY_LEVELS.map((_, index) => index).filter((index) => Number.isFinite(probabilities[String(index)]));
  if (present.length === 0) {
    const index = Math.min(ANOMALY_LEVELS.length - 1, Math.max(0, Math.round(score)));
    return { score: ANOMALY_LEVELS[index], probability: 0 };
  }
  let bestIndex = present[0];
  for (const index of present) {
    if ((probabilities[String(index)] ?? 0) >= (probabilities[String(bestIndex)] ?? 0)) bestIndex = index;
  }
  return {
    score: ANOMALY_LEVELS[bestIndex],
    probability: probabilities[String(bestIndex)] ?? 0,
  };
}

export function mapSystemOneAnswers(payload: unknown): Omit<JevResult, "latencyMs" | "source"> {
  const parsed = systemOneSchema.safeParse(payload);
  if (!parsed.success) throw new Error("La respuesta de JEV no trae Noul, Score y Choice.");
  const { answers } = parsed.data;
  const costCenter = answers.Q4_COST_CENTER.choice;
  return {
    contractCoherence: noulAnswer(answers.Q1_CONTRACT_COHERENCE.noul),
    semanticDuplicate: noulAnswer(answers.Q2_SEMANTIC_DUPLICATE.noul),
    socialEngineeringRisk: anomalyFromScore(answers.Q3_ANOMALY_SCORE.score, answers.Q3_ANOMALY_SCORE.probabilities),
    costCenter: {
      choice: costCenter,
      probability: answers.Q4_COST_CENTER.probabilities[costCenter] ?? 0,
    },
  };
}

function jevRequest(invoice: Invoice, recent: Invoice[]) {
  const vendor = findVendor(invoice.vendorId);
  return {
    state: {
      invoice: {
        id: invoice.id,
        vendorName: invoice.vendorName,
        description: invoice.description,
        lineItems: invoice.lineItems,
        evidenceNote: invoice.evidenceNote,
        periodKey: invoice.periodKey,
        totalPayable: invoice.totalPayable,
        currency: invoice.currency,
      },
      contract: vendor?.contractSummary ?? "Sin contrato.",
      registeredBankAccountLast4: vendor?.bankAccountLast4 ?? null,
      recentInvoices: recent.slice(-5).map((item) => ({
        id: item.id,
        invoiceNumber: item.invoiceNumber,
        description: item.description,
        periodKey: item.periodKey,
        lineItems: item.lineItems,
      })),
    },
    model: JEV_MODEL,
    questions: {
      Q1_CONTRACT_COHERENCE: {
        type: "noul",
        instructions:
          "¿El concepto y los ítems cobrados en `invoice` corresponden semánticamente al giro y servicios acordados en `contract`?",
        criteria: {
          true: "El cobro corresponde al contrato de este proveedor.",
          false: "El cobro no corresponde al giro o a los servicios acordados.",
        },
      },
      Q2_SEMANTIC_DUPLICATE: {
        type: "noul",
        instructions:
          "¿`invoice` cobra exactamente el mismo entregable y periodo que alguna entrada de `recentInvoices`, aunque use diferente redacción o formato?",
        criteria: {
          true: "Repite el mismo entregable y el mismo periodo de una factura previa.",
          false: "No repite entregable y periodo de las facturas previas.",
        },
      },
      Q3_ANOMALY_SCORE: {
        type: "score",
        instructions:
          "¿Qué nivel de riesgo de manipulación, urgencia atípica o cambio no autorizado de datos bancarios presenta `invoice` frente a `registeredBankAccountLast4`?",
        criteria: [
          "LOW: sin manipulación, sin urgencia atípica y sin cambio de cuenta.",
          "MEDIUM: hay presión o inconsistencia, pero no un fraude claro.",
          "HIGH: pide pagar urgente a una cuenta distinta de la registrada, o el mensaje está manipulado.",
        ],
      },
      Q4_COST_CENTER: {
        type: "choice",
        instructions: "¿A qué partida presupuestaria pertenece el gasto de `invoice`?",
        criteria: {
          "Cloud & Infra": "Cómputo, almacenamiento, red o infraestructura.",
          "Marketing & Growth": "Diseño, UX, campañas o crecimiento.",
          "Software Development": "Desarrollo o mantenimiento de software.",
          "Legal & Admin": "Asesoría legal, contratos o administración.",
          "Facilities & Maintenance": "Instalaciones, oficios o mantenimiento físico.",
          Other: "No encaja en las partidas anteriores.",
        },
      },
    },
  };
}

export async function evaluateJev(invoice: Invoice, recent: Invoice[], keys: ByokKeys): Promise<JevRun> {
  const snapshot: JevResult | null = invoice.jevSnapshot ? { ...invoice.jevSnapshot, source: "snapshot" } : null;
  if (!keys.jev) {
    return {
      result: snapshot,
      mode: "fallback",
      raw: {
        reason: snapshot
          ? "Sin TYPESAFE_JEV_KEY. Se conserva el snapshot JEV."
          : "Sin TYPESAFE_JEV_KEY. JEV no se consultó.",
      },
    };
  }

  const started = performance.now();
  const endpoint = process.env.TYPESAFE_JEV_URL ?? JEV_ENDPOINT;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${keys.jev}`,
      },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify(jevRequest(invoice, recent)),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 280);
      throw new Error(`JEV respondió ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    const raw = await response.json();
    const mapped = mapSystemOneAnswers(raw);
    const result: JevResult = {
      ...mapped,
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
