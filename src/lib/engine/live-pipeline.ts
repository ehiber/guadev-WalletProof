import { extractInvoice } from "@/lib/engine/1-extractor";
import { evaluateHardRules } from "@/lib/engine/2-hard-rules";
import { evaluateJev } from "@/lib/engine/3-jev-client";
import { explainDecision } from "@/lib/engine/4-explainer";
import type { ByokKeys } from "@/lib/engine/model-provider";
import { evaluateInvoice } from "@/lib/engine/pipeline";
import { INITIAL_DATASET } from "@/lib/mock-data/initial-dataset";
import type { AuditRecord, CompanyRules, Invoice, PriorDocument } from "@/types/blinka";

export interface LayerTiming {
  layer: "extract" | "rules" | "jev" | "explain";
  ms: number;
  mode: "live" | "fallback" | "local" | "skipped";
  model?: string;
  detail: string;
}

export interface LiveInvoiceResult {
  invoice: Invoice;
  timings: LayerTiming[];
  raw: {
    extraction: unknown;
    jev: unknown;
    explanation: unknown;
    record: AuditRecord;
  };
  explanation: { text: string; mode: "live" | "fallback" };
}

function keysFromEnv(override: ByokKeys): ByokKeys {
  return {
    gemini: override.gemini || process.env.GEMINI_API_KEY || undefined,
    groq: override.groq || process.env.GROQ_API_KEY || undefined,
    jev: override.jev || process.env.TYPESAFE_JEV_KEY || undefined,
  };
}

export async function runLiveInvoices(
  ids: string[],
  rules: CompanyRules,
  override: ByokKeys,
): Promise<{ results: LiveInvoiceResult[]; records: AuditRecord[]; invoices: Invoice[] }> {
  const keys = keysFromEnv(override);
  const wanted = new Set(ids);
  const invoices = INITIAL_DATASET.map((invoice) => ({ ...invoice }));
  const prepared = new Map<string, Awaited<ReturnType<typeof extractInvoice>>>();
  const extractMs = new Map<string, number>();

  for (const invoice of invoices) {
    if (!wanted.has(invoice.id)) continue;
    const started = performance.now();
    prepared.set(invoice.id, await extractInvoice(invoice, keys));
    extractMs.set(invoice.id, Math.max(1, Math.round(performance.now() - started)));
  }

  const priors: PriorDocument[] = [];
  let spent = 0;
  const records: AuditRecord[] = [];
  const live = new Map<string, LiveInvoiceResult>();
  const merged: Invoice[] = [];

  for (const original of invoices) {
    const extracted = prepared.get(original.id);
    const invoice = extracted?.invoice ?? original;
    const rulesStarted = performance.now();
    const { hard } = evaluateHardRules(invoice, rules, priors, spent);
    const rulesMs = Math.max(1, Math.round(performance.now() - rulesStarted));

    let jevTiming: LayerTiming = {
      layer: "jev",
      ms: 0,
      mode: "skipped",
      detail: "JEV no corre: hay una regla dura en fallo.",
    };
    let jevRaw: unknown = { skipped: true };

    if (hard.passed && wanted.has(original.id)) {
      const recent = invoices.filter((item) => item.vendorId === invoice.vendorId && item.id !== invoice.id);
      const jevStarted = performance.now();
      const jev = await evaluateJev(invoice, recent, keys);
      invoice.jevSnapshot = jev.result;
      jevRaw = jev.raw;
      jevTiming = {
        layer: "jev",
        ms: jev.mode === "live" ? jev.result.latencyMs : Math.round(performance.now() - jevStarted),
        mode: jev.mode,
        detail: jev.error ?? (jev.mode === "live" ? "JEV en vivo." : "Snapshot JEV."),
      };
    } else if (hard.passed) {
      jevTiming = {
        layer: "jev",
        ms: invoice.jevSnapshot.latencyMs,
        mode: "fallback",
        detail: "Snapshot JEV del dataset.",
      };
    }

    const record = evaluateInvoice(invoice, rules, priors, spent, hard.passed ? invoice.jevSnapshot : null);
    merged.push(invoice);
    records.push(record);
    priors.push({
      invoiceNumber: invoice.invoiceNumber,
      vendorId: invoice.vendorId,
      documentHash: invoice.documentHash,
    });
    if (record.finalStatus === "APPROVED") {
      spent = Number((spent + record.totalPayableUsd).toFixed(2));
    }

    if (!wanted.has(original.id)) continue;

    const explainStarted = performance.now();
    const explanation = await explainDecision(record, keys);
    live.set(original.id, {
      invoice,
      timings: [
        {
          layer: "extract",
          ms: extractMs.get(original.id) ?? 1,
          mode: extracted?.mode ?? "fallback",
          model: extracted?.model,
          detail: extracted?.error ?? (extracted?.mode === "live" ? "Extracción Zod válida." : "Snapshot de extracción."),
        },
        { layer: "rules", ms: rulesMs, mode: "local", detail: record.finalStatus },
        jevTiming,
        {
          layer: "explain",
          ms: Math.max(1, Math.round(performance.now() - explainStarted)),
          mode: explanation.mode,
          model: explanation.model,
          detail: explanation.error ?? (explanation.mode === "live" ? "Explicación Groq." : "Texto determinista."),
        },
      ],
      raw: {
        extraction: extracted?.raw ?? null,
        jev: jevRaw,
        explanation: explanation.raw,
        record,
      },
      explanation: { text: explanation.text, mode: explanation.mode },
    });
  }

  return { results: [...live.values()], records, invoices: merged };
}
