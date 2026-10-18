import { timingSafeEqual } from "node:crypto";
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
import { deliverEscalation, escalationNotice, openClawGatewayReady } from "@/lib/openclaw/gateway";
import { chatCanReceiveInvoice, INVOICE_ONLY_REPLY } from "@/lib/openclaw/invoice-guard";
import { arrivedInvoices, rememberHuman, sessionRules } from "@/lib/session-inbox";
import { z } from "zod";

const escalationSchema = z
  .object({
    kind: z.literal("escalation"),
    invoiceId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/),
    payload: z
      .object({
        totalPayableUsd: z.number().finite().min(0).max(1_000_000_000),
        status: z.enum(["APPROVED", "ESCALATED", "BLOCKED"]),
        explanation: z.string().max(1500),
      })
      .strict(),
  })
  .strict();

function clampEscalation(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const record = body as { kind?: unknown; payload?: unknown };
  if (record.kind !== "escalation" || !record.payload || typeof record.payload !== "object") return body;
  const payload = record.payload as { explanation?: unknown };
  if (typeof payload.explanation !== "string") return body;
  return { ...record, payload: { ...payload, explanation: payload.explanation.slice(0, 1500) } };
}

function authorized(request: Request): boolean {
  const provided = request.headers.get("x-openclaw-secret") ?? "";
  const expected = openClawSecret();
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
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

  const parsed = escalationSchema.safeParse(clampEscalation(body));
  if (!parsed.success) {
    return Response.json({ error: "No se pudo avisar a OpenClaw." }, { status: 400 });
  }
  if (openClawGatewayReady()) {
    const limited = takeLiveSlot(clientIp(request));
    if (limited) {
      return Response.json({ error: "No se pudo avisar a OpenClaw." }, { status: 429 });
    }
  }
  const delivery = await deliverEscalation(
    escalationNotice({
      invoiceId: parsed.data.invoiceId,
      status: parsed.data.payload.status,
      totalPayableUsd: parsed.data.payload.totalPayableUsd,
      explanation: parsed.data.payload.explanation,
    }),
  );
  if (delivery === "failed") {
    return Response.json({ error: "No se pudo avisar a OpenClaw." }, { status: 502 });
  }
  const event = pushOpenClawEvent({
    kind: "escalation",
    invoiceId: parsed.data.invoiceId,
    payload: {
      status: parsed.data.payload.status,
      totalPayableUsd: parsed.data.payload.totalPayableUsd,
      delivered: delivery === "sent",
    },
  });
  return Response.json({ event });
}
