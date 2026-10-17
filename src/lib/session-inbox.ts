import { clearDocuments, pruneDocuments } from "@/lib/inbound/documents";
import type { LayerTiming } from "@/lib/engine/live-pipeline";
import { DEFAULT_RULES } from "@/lib/mock-data/company-rules";
import type { CompanyRules, Invoice } from "@/types/blinka";

export type Arrival = {
  invoice: Invoice;
  timings: LayerTiming[];
  raw: unknown;
  explanation: { text: string; mode: "live" | "fallback" };
};

export type HumanNote = { decision: "APPROVED" | "BLOCKED"; note: string };

type SessionInbox = {
  rules: CompanyRules;
  arrived: Arrival[];
  human: Record<string, HumanNote>;
};

declare global {
  var blinkaSession: SessionInbox | undefined;
}

const ARRIVED_CAP = 16;

function inbox(): SessionInbox {
  globalThis.blinkaSession ??= { rules: { ...DEFAULT_RULES }, arrived: [], human: {} };
  return globalThis.blinkaSession;
}

export function sessionRules(): CompanyRules {
  return { ...inbox().rules };
}

export function publishRules(rules: CompanyRules) {
  inbox().rules = { ...rules };
}

export function clearHumanNotes() {
  inbox().human = {};
}

export function rememberArrival(arrival: Arrival) {
  const session = inbox();
  const index = session.arrived.findIndex((item) => item.invoice.id === arrival.invoice.id);
  if (index >= 0) session.arrived[index] = arrival;
  else session.arrived.push(arrival);
  if (session.arrived.length > ARRIVED_CAP) session.arrived.splice(0, session.arrived.length - ARRIVED_CAP);
  pruneDocuments(new Set(session.arrived.map((item) => item.invoice.id)));
}

export function arrivedInvoices(): Invoice[] {
  return inbox().arrived.map((item) => item.invoice);
}

export function listArrivals(): Arrival[] {
  return inbox().arrived.map((item) => ({ ...item }));
}

export function sessionHuman(): Record<string, HumanNote> {
  return { ...inbox().human };
}

export function rememberHuman(invoiceId: string, note: HumanNote) {
  inbox().human[invoiceId] = note;
}

export function clearSession() {
  globalThis.blinkaSession = { rules: { ...DEFAULT_RULES }, arrived: [], human: {} };
  clearDocuments();
}
