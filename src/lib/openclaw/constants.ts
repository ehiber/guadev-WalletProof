export const OPENCLAW_DEMO_SECRET = "blinka-demo";

export type OpenClawEvent = {
  id: string;
  at: string;
  kind: "ingest" | "escalation" | "approval";
  invoiceId?: string;
  payload: unknown;
};

declare global {
  var openclawEvents: OpenClawEvent[] | undefined;
}

export function openClawSecret(): string {
  return process.env.OPENCLAW_WEBHOOK_SECRET || OPENCLAW_DEMO_SECRET;
}

const MAX_EVENTS = 50;

export function readOpenClawEvents(): OpenClawEvent[] {
  globalThis.openclawEvents ??= [];
  return globalThis.openclawEvents;
}

export function pushOpenClawEvent(input: {
  kind: OpenClawEvent["kind"];
  invoiceId?: string;
  payload?: unknown;
}): OpenClawEvent {
  const event: OpenClawEvent = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    kind: input.kind,
    invoiceId: input.invoiceId,
    payload: input.payload ?? {},
  };
  const log = readOpenClawEvents();
  log.push(event);
  if (log.length > MAX_EVENTS) log.splice(0, log.length - MAX_EVENTS);
  return event;
}

export function clearOpenClawEvents() {
  globalThis.openclawEvents = [];
}
