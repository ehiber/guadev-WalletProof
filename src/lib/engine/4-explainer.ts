import { completeWithRetry, type ByokKeys } from "@/lib/engine/model-provider";
import type { AuditRecord } from "@/types/blinka";

export interface ExplanationRun {
  text: string;
  mode: "live" | "fallback";
  model?: string;
  escalated: boolean;
  raw: unknown;
  error?: string;
}

export async function explainDecision(record: AuditRecord, keys: ByokKeys): Promise<ExplanationRun> {
  if (!keys.explain?.apiKey) {
    return {
      text: record.explanation,
      mode: "fallback",
      escalated: false,
      raw: { reason: "Sin clave en la capa de redacción. Se usa el texto determinista." },
    };
  }

  const input = {
    system:
      "Redacta en español, en dos oraciones, la justificación para finanzas. No cambies el veredicto. No recalcules montos. Si el estado es BLOCKED o ESCALATED, no digas que el pago fue aprobado.",
    user: JSON.stringify({
      finalStatus: record.finalStatus,
      totalPayableUsd: record.totalPayableUsd,
      reasons: record.hardRulesResult.reasons,
      jev: record.jevResult,
      deterministic: record.explanation,
    }),
  };

  try {
    const result = await completeWithRetry(keys.explain, input, (text) => text.trim().length >= 20);
    const text = result.text.trim();
    if (text.length < 20) {
      return {
        text: record.explanation,
        mode: "fallback",
        escalated: result.escalated,
        raw: { text },
        error: "La explicación llegó vacía. Se usa el texto determinista.",
      };
    }
    return { text, mode: "live", model: result.model, escalated: result.escalated, raw: { text } };
  } catch (error) {
    return {
      text: record.explanation,
      mode: "fallback",
      escalated: false,
      raw: { reason: error instanceof Error ? error.message : "Fallo de redacción" },
      error: error instanceof Error ? error.message : "Fallo de redacción",
    };
  }
}
