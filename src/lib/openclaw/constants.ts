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
