import { attachmentFrom, ingestIncoming, publishVerdict } from "@/lib/engine/ingest";
import { clientIp, takeLiveSlot } from "@/lib/engine/live-budget";
import { evaluateBatch } from "@/lib/engine/pipeline";
import { INITIAL_DATASET } from "@/lib/mock-data/initial-dataset";
import {
  clearOpenClawEvents,
  openClawSecret,
  pushOpenClawEvent,
  readOpenClawEvents,
  type OpenClawEvent,
} from "@/lib/openclaw/constants";
import { arrivedInvoices, rememberHuman, sessionRules } from "@/lib/session-inbox";

function authorized(request: Request): boolean {
  return request.headers.get("x-openclaw-secret") === openClawSecret();
}

function recordFor(invoiceId: string) {
  const invoices = [...INITIAL_DATASET, ...arrivedInvoices()];
  return evaluateBatch(invoices, sessionRules()).find((record) => record.invoiceId === invoiceId);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Secreto inválido." }, { status: 401 });
  }
  return Response.json({ events: readOpenClawEvents() });
}

export async function DELETE(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Secreto inválido." }, { status: 401 });
  }
  clearOpenClawEvents();
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Secreto inválido." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    kind?: OpenClawEvent["kind"];
    invoiceId?: string;
    payload?: unknown;
  } | null;
  if (!body?.kind || !["ingest", "escalation", "approval"].includes(body.kind)) {
    return Response.json({ error: "El evento necesita kind." }, { status: 400 });
  }

  if (body.kind === "ingest") {
    const attached = attachmentFrom(body.payload);
    if (!attached.text?.trim() && !attached.bytes?.byteLength) {
      const event = pushOpenClawEvent({ kind: "ingest", invoiceId: body.invoiceId, payload: body.payload ?? {} });
      return Response.json({ event });
    }
    const limited = takeLiveSlot(clientIp(request));
    if (limited) {
      return Response.json({ error: limited }, { status: 429 });
    }
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
      const event = pushOpenClawEvent({ kind: "ingest", invoiceId: body.invoiceId, payload: { error: reason } });
      return Response.json({ error: reason, event }, { status: 400 });
    }
  }

  if (body.kind === "approval") {
    const payload = (body.payload ?? {}) as { decision?: unknown; note?: unknown };
    const decision = payload.decision === "APPROVED" || payload.decision === "BLOCKED" ? payload.decision : null;
    const note = typeof payload.note === "string" ? payload.note.trim() : "";
    if (!body.invoiceId || !decision || !note) {
      return Response.json({ error: "La aprobación necesita factura, decisión y nota." }, { status: 400 });
    }
    const record = recordFor(body.invoiceId);
    if (!record || record.finalStatus !== "ESCALATED") {
      const event = pushOpenClawEvent({
        kind: "approval",
        invoiceId: body.invoiceId,
        payload: { decision, note, ignored: true, reason: "El harness no dejó esta factura escalada." },
      });
      return Response.json({ event, applied: false });
    }
    rememberHuman(body.invoiceId, { decision, note });
    const event = pushOpenClawEvent({
      kind: "approval",
      invoiceId: body.invoiceId,
      payload: { decision, note, applied: true },
    });
    return Response.json({ event, applied: true });
  }

  const event = pushOpenClawEvent({ kind: body.kind, invoiceId: body.invoiceId, payload: body.payload ?? {} });
  return Response.json({ event });
}
