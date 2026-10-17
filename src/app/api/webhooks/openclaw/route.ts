import { openClawSecret, type OpenClawEvent } from "@/lib/openclaw/constants";

const MAX_EVENTS = 50;

function events(): OpenClawEvent[] {
  globalThis.openclawEvents ??= [];
  return globalThis.openclawEvents;
}

function authorized(request: Request): boolean {
  return request.headers.get("x-openclaw-secret") === openClawSecret();
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Secreto inválido." }, { status: 401 });
  }
  return Response.json({ events: events() });
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
  const event: OpenClawEvent = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    kind: body.kind,
    invoiceId: body.invoiceId,
    payload: body.payload ?? {},
  };
  const log = events();
  log.push(event);
  if (log.length > MAX_EVENTS) log.splice(0, log.length - MAX_EVENTS);
  return Response.json({ event });
}

export async function DELETE(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Secreto inválido." }, { status: 401 });
  }
  globalThis.openclawEvents = [];
  return Response.json({ ok: true });
}
