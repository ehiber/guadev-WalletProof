import { runLiveInvoices } from "@/lib/engine/live-pipeline";
import type { ByokKeys } from "@/lib/engine/model-provider";
import type { CompanyRules } from "@/types/blinka";
import { z } from "zod";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(8),
  rules: z.object({
    maxAutoApproveUsd: z.number().positive(),
    monthlyBudgetUsd: z.number().positive(),
    jevConfidenceThreshold: z.number().min(0.5).max(0.99),
    semanticDuplicateMinProbability: z.number().min(0).max(1),
  }),
  keys: z
    .object({
      gemini: z.string().optional(),
      groq: z.string().optional(),
      jev: z.string().optional(),
    })
    .optional(),
});

type Bucket = { count: number; resetAt: number };

function buckets(): Map<string, Bucket> {
  const root = globalThis as typeof globalThis & { evaluateBuckets?: Map<string, Bucket> };
  root.evaluateBuckets ??= new Map();
  return root.evaluateBuckets;
}

function allow(ip: string): boolean {
  const now = Date.now();
  const table = buckets();
  const current = table.get(ip);
  if (!current || current.resetAt < now) {
    table.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= 30) return false;
  current.count += 1;
  return true;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(ip)) {
    return Response.json({ error: "Demasiadas ejecuciones. Espera un minuto." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "El cuerpo no trae ids y reglas válidas." }, { status: 400 });
  }

  const keys: ByokKeys = {
    gemini: parsed.data.keys?.gemini,
    groq: parsed.data.keys?.groq,
    jev: parsed.data.keys?.jev,
  };
  const rules: CompanyRules = parsed.data.rules;
  const outcome = await runLiveInvoices(parsed.data.ids, rules, keys);

  return Response.json({
    invoices: outcome.invoices,
    records: outcome.records,
    results: outcome.results,
  });
}
