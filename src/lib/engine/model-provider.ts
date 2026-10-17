import type { Currency, Invoice } from "@/types/blinka";
import { z } from "zod";

export const extractionSchema = z
  .object({
    invoiceNumber: z.string().min(1),
    vendorName: z.string().min(1),
    currency: z.enum(["USD", "COP", "MXN", "VES", "ARS"]),
    subtotal: z.number().nonnegative(),
    taxAmount: z.number().nonnegative(),
    totalPayable: z.number().positive(),
    description: z.string().min(1),
  })
  .refine((value) => Math.abs(value.subtotal + value.taxAmount - value.totalPayable) < 0.05, {
    message: "subtotal + taxAmount must equal totalPayable",
  });

export type Extraction = z.infer<typeof extractionSchema>;

export interface ByokKeys {
  gemini?: string;
  groq?: string;
  jev?: string;
}

export interface ModelRequest {
  system: string;
  user: string;
}

export interface ModelClient {
  id: string;
  complete(input: ModelRequest): Promise<string>;
}

export function stripJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced?.[1] ?? text).trim();
}

export function geminiClient(apiKey: string, model: string): ModelClient {
  return {
    id: model,
    async complete({ system, user }) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: AbortSignal.timeout(12000),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: { temperature: 0 },
          }),
        },
      );
      if (!response.ok) {
        throw new Error(`Gemini ${model} respondió ${response.status}`);
      }
      const body = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
      if (!text.trim()) throw new Error(`Gemini ${model} devolvió vacío`);
      return text;
    },
  };
}

export function groqClient(apiKey: string, model: string): ModelClient {
  return {
    id: model,
    async complete({ system, user }) {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`Groq ${model} respondió ${response.status}`);
      }
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = body.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) throw new Error(`Groq ${model} devolvió vacío`);
      return text;
    },
  };
}

export async function completeWithRetry(
  cheap: ModelClient,
  strong: ModelClient,
  input: ModelRequest,
  accept: (text: string) => boolean,
): Promise<{ text: string; model: string; escalated: boolean }> {
  try {
    const text = await cheap.complete(input);
    if (accept(text)) return { text, model: cheap.id, escalated: false };
  } catch {
    // The strong model is the single retry.
  }
  const text = await strong.complete(input);
  return { text, model: strong.id, escalated: true };
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
  };
}

export function applyExtraction(invoice: Invoice, extraction: Extraction): Invoice {
  return {
    ...invoice,
    invoiceNumber: extraction.invoiceNumber,
    vendorName: extraction.vendorName,
    currency: extraction.currency as Currency,
    subtotal: extraction.subtotal,
    taxAmount: extraction.taxAmount,
    totalPayable: extraction.totalPayable,
    description: extraction.description,
  };
}
