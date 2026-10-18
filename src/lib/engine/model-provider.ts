import { isPayableCurrency } from "@/lib/engine/currency";
import type { Invoice } from "@/types/blinka";
import { z } from "zod";

export const extractionSchema = z
  .object({
    invoiceNumber: z.string().min(1),
    vendorName: z.string().min(1),
    currency: z.string().regex(/^[A-Z]{3,5}$/).refine(isPayableCurrency),
    subtotal: z.number().nonnegative(),
    taxAmount: z.number().nonnegative(),
    totalPayable: z.number().positive(),
    description: z.string().min(1),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    projectReference: z.string().trim().min(1).optional(),
  })
  .refine((value) => Math.abs(value.subtotal + value.taxAmount - value.totalPayable) < 0.05, {
    message: "subtotal + taxAmount must equal totalPayable",
  });

export type Extraction = z.infer<typeof extractionSchema>;

export const OPENAI_CHAT = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-5-nano",
  fallbackModel: "gpt-6-luna",
} as const;

const RETIRED_MODELS = new Set([
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-3.5-turbo",
]);

export interface LayerConfig {
  model: string;
  fallbackModel: string;
  apiKey?: string;
}

export interface ByokKeys {
  read?: LayerConfig;
  explain?: LayerConfig;
  jev?: string;
}

export function emptyLayer(): LayerConfig {
  return { model: OPENAI_CHAT.model, fallbackModel: OPENAI_CHAT.fallbackModel };
}

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export interface ModelRequest {
  system: string;
  user: string | ChatPart[];
}

export interface ModelClient {
  id: string;
  complete(input: ModelRequest): Promise<string>;
}

function chooseModel(value: string, preset: string): string {
  const trimmed = value.trim();
  if (!trimmed || RETIRED_MODELS.has(trimmed)) return preset;
  return trimmed;
}

function fillLayer(layer: LayerConfig): LayerConfig {
  return {
    apiKey: layer.apiKey?.trim() || undefined,
    model: chooseModel(layer.model, OPENAI_CHAT.model),
    fallbackModel: chooseModel(layer.fallbackModel, OPENAI_CHAT.fallbackModel),
  };
}

function reasoningEffort(model: string): "minimal" | "low" | undefined {
  if (model.startsWith("gpt-5-nano")) return "minimal";
  if (model.startsWith("gpt-6-luna") || model.startsWith("gpt-5.6-luna")) return "low";
  return undefined;
}

function layerFromRecord(value: unknown): LayerConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const provider = typeof record.provider === "string" ? record.provider : "openai";
  if (provider !== "openai") return undefined;
  return fillLayer({
    model: typeof record.model === "string" ? record.model : "",
    fallbackModel: typeof record.fallbackModel === "string" ? record.fallbackModel : "",
    apiKey: typeof record.apiKey === "string" ? record.apiKey : undefined,
  });
}

export function normalizeKeys(raw: unknown): ByokKeys {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as Record<string, unknown>;
  const jev = typeof value.jev === "string" ? value.jev.trim() || undefined : undefined;
  return { read: layerFromRecord(value.read), explain: layerFromRecord(value.explain), jev };
}

function layerFromEnv(prefix: "BLINKA_READ" | "BLINKA_EXPLAIN"): LayerConfig | undefined {
  const named = process.env[`${prefix}_PROVIDER`]?.trim();
  if (named && named !== "openai") return undefined;
  const apiKey = process.env[`${prefix}_API_KEY`];
  if (!apiKey?.trim()) return undefined;
  return fillLayer({
    apiKey,
    model: process.env[`${prefix}_MODEL`] ?? "",
    fallbackModel: process.env[`${prefix}_FALLBACK_MODEL`] ?? "",
  });
}

export function resolveKeys(override: ByokKeys = {}): ByokKeys {
  const read =
    (override.read?.apiKey?.trim() ? fillLayer({ ...override.read, apiKey: override.read.apiKey.trim() }) : undefined) ??
    layerFromEnv("BLINKA_READ");
  const explain =
    (override.explain?.apiKey?.trim()
      ? fillLayer({ ...override.explain, apiKey: override.explain.apiKey.trim() })
      : undefined) ?? layerFromEnv("BLINKA_EXPLAIN");
  return {
    read,
    explain,
    jev: override.jev?.trim() || process.env.TYPESAFE_JEV_KEY || undefined,
  };
}

async function providerFailure(response: Response, model: string): Promise<string> {
  await response.text().catch(() => "");
  if (response.status === 429) {
    return `El modelo ${model} llegó al límite de peticiones. Espera un minuto.`;
  }
  return `OpenAI respondió ${response.status} (${model})`;
}

export function stripJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced?.[1] ?? text).trim();
}

export function chatClient(layer: LayerConfig, model: string): ModelClient {
  return {
    id: model,
    async complete({ system, user }) {
      if (!layer.apiKey) throw new Error("La capa no tiene clave.");
      if (!model) throw new Error("La capa no tiene modelo.");
      const effort = reasoningEffort(model);
      const response = await fetch(`${OPENAI_CHAT.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${layer.apiKey}`,
        },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          model,
          ...(effort ? { reasoning_effort: effort } : { temperature: 0 }),
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(await providerFailure(response, model));
      }
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      const text = Array.isArray(content) ? content.map((part) => part.text ?? "").join("") : (content ?? "");
      if (!text.trim()) throw new Error("OpenAI devolvió vacío");
      return text;
    },
  };
}

export async function completeWithRetry(
  layer: LayerConfig,
  input: ModelRequest,
  accept: (text: string) => boolean,
): Promise<{ text: string; model: string; escalated: boolean }> {
  const ready = fillLayer(layer);
  if (!ready.model) throw new Error("La capa no tiene modelo.");
  const primary = chatClient(ready, ready.model);
  if (ready.fallbackModel === ready.model) {
    const text = await primary.complete(input);
    if (!accept(text)) throw new Error("La respuesta no pasó la validación.");
    return { text, model: ready.model, escalated: false };
  }
  try {
    const text = await primary.complete(input);
    if (accept(text)) return { text, model: ready.model, escalated: false };
  } catch {
    // One retry with the fallback model of the same layer.
  }
  const text = await chatClient(ready, ready.fallbackModel).complete(input);
  return { text, model: ready.fallbackModel, escalated: true };
}

export function extractionFromInvoice(invoice: Invoice): Extraction {
  return {
    invoiceNumber: invoice.invoiceNumber,
    vendorName: invoice.vendorName,
    currency: invoice.currency,
    subtotal: invoice.subtotal,
    taxAmount: invoice.taxAmount,
    totalPayable: invoice.totalPayable,
    description: invoice.description,
    issueDate: invoice.issueDate,
    ...(invoice.projectReference ? { projectReference: invoice.projectReference } : {}),
  };
}

export function applyExtraction(invoice: Invoice, extraction: Extraction): Invoice {
  return {
    ...invoice,
    invoiceNumber: extraction.invoiceNumber,
    vendorName: extraction.vendorName,
    currency: extraction.currency,
    subtotal: extraction.subtotal,
    taxAmount: extraction.taxAmount,
    totalPayable: extraction.totalPayable,
    description: extraction.description,
    issueDate: extraction.issueDate,
    periodKey: extraction.issueDate.slice(0, 7),
    projectReference: extraction.projectReference,
  };
}
