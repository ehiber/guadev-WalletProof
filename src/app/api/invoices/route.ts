import { ingestIncoming, MAX_DOCUMENT_BYTES, publishVerdict } from "@/lib/engine/ingest";
import { clientIp, takeLiveSlot } from "@/lib/engine/live-budget";
import { normalizeKeys } from "@/lib/engine/model-provider";
import { parseInvoices, parseRules } from "@/lib/engine/schemas";
import { clearSession, listArrivals, publishRules, sessionHuman } from "@/lib/session-inbox";

export async function GET() {
  return Response.json({ arrived: listArrivals(), human: sessionHuman() });
}

export async function DELETE() {
  clearSession();
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Falta el archivo de la factura." }, { status: 400 });
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return Response.json({ error: "El archivo supera 4 MB." }, { status: 400 });
  }
  const rules = parseRules(readJson(form?.get("rules")));
  const existing = parseInvoices(readJson(form?.get("invoices")) ?? []);
  if (!rules || !existing) {
    return Response.json({ error: "La bandeja o las reglas no son válidas." }, { status: 400 });
  }
  if (existing.length >= 24) {
    return Response.json({ error: "La bandeja llegó al tope de 24 facturas." }, { status: 400 });
  }
  const limited = takeLiveSlot(clientIp(request));
  if (limited) {
    return Response.json({ error: limited }, { status: 429 });
  }
  publishRules(rules);
  const keys = normalizeKeys(readJson(form?.get("keys")) ?? {});
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = mimeFor(file);
  try {
    const outcome = await ingestIncoming({
      channel: "pdf",
      bytes,
      mime,
      filename: file.name,
      rules,
      keys,
      existing,
    });
    publishVerdict("pdf", outcome);
    return Response.json(outcome);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo leer la factura.";
    return Response.json({ error: message }, { status: 400 });
  }
}

function mimeFor(file: File): string {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".svg")) return "image/svg+xml";
  return "";
}

function readJson(value: FormDataEntryValue | null | undefined): unknown {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
