import { attachmentFrom, ingestIncoming, publishVerdict } from "@/lib/engine/ingest";
import { clientIp, takeLiveSlot } from "@/lib/engine/live-budget";
import { INITIAL_DATASET } from "@/lib/mock-data/initial-dataset";
import { pushOpenClawEvent } from "@/lib/openclaw/constants";
import { chatCanReceiveInvoice, INVOICE_ONLY_REPLY } from "@/lib/openclaw/invoice-guard";
import { arrivedInvoices, sessionRules } from "@/lib/session-inbox";

export async function ingestChatPayload(request: Request, payload: unknown, invoiceId?: string) {
  const attached = attachmentFrom(payload);
  if (attached.text) attached.text = attached.text.slice(0, 4000);
  const gate = chatCanReceiveInvoice({
    text: attached.text,
    byteLength: attached.bytes?.byteLength ?? 0,
    mime: attached.mime,
    filename: attached.filename,
  });
  if (!gate.ok) {
    const event = pushOpenClawEvent({ kind: "ingest", payload: { accepted: false } });
    return Response.json({ accepted: false, reply: INVOICE_ONLY_REPLY, event });
  }
  if (gate.mime) attached.mime = gate.mime;
  const limited = takeLiveSlot(clientIp(request));
  if (limited) return Response.json({ error: limited }, { status: 429 });

  try {
    const outcome = await ingestIncoming({
      channel: "chat",
      text: attached.text,
      bytes: attached.bytes,
      mime: attached.mime,
      filename: attached.filename,
      rules: sessionRules(),
      keys: {},
      existing: [...INITIAL_DATASET, ...arrivedInvoices()],
    });
    const event = publishVerdict("chat", outcome);
    return Response.json({ event, invoice: outcome.invoice, record: outcome.record });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "No se pudo leer el mensaje.";
    const event = pushOpenClawEvent({ kind: "ingest", invoiceId, payload: { error: reason } });
    return Response.json({ error: reason, event }, { status: 400 });
  }
}
