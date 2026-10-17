import { clientIp, takeLiveSlot } from "@/lib/engine/live-budget";
import { runLiveInvoices } from "@/lib/engine/live-pipeline";
import { normalizeKeys } from "@/lib/engine/model-provider";
import { parseInvoices, parseRules } from "@/lib/engine/schemas";
import { z } from "zod";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(24),
  rules: z.unknown(),
  keys: z.unknown().optional(),
  invoices: z.unknown().optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "El cuerpo no trae ids y reglas válidas." }, { status: 400 });
  }
  const rules = parseRules(parsed.data.rules);
  if (!rules) {
    return Response.json({ error: "El cuerpo no trae ids y reglas válidas." }, { status: 400 });
  }
  const invoices = parsed.data.invoices === undefined ? undefined : parseInvoices(parsed.data.invoices);
  if (parsed.data.invoices !== undefined && !invoices) {
    return Response.json({ error: "La lista de facturas no es válida." }, { status: 400 });
  }
  const limited = takeLiveSlot(clientIp(request));
  if (limited) {
    return Response.json({ error: limited }, { status: 429 });
  }

  const outcome = await runLiveInvoices(parsed.data.ids, rules, normalizeKeys(parsed.data.keys), invoices ?? undefined);

  return Response.json({
    invoices: outcome.invoices,
    records: outcome.records,
    results: outcome.results,
  });
}
