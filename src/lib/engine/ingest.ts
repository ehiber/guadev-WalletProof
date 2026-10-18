import { extractDocument, payableIsAuditable, type DocumentRead, type PartialExtraction } from "@/lib/engine/1-extractor";
import { compareBankAccount } from "@/lib/engine/bank-account";
import { evaluateHardRules } from "@/lib/engine/2-hard-rules";
import { evaluateJev } from "@/lib/engine/3-jev-client";
import { explainDecision } from "@/lib/engine/4-explainer";
import type { LayerTiming } from "@/lib/engine/live-pipeline";
import { resolveKeys, type ByokKeys } from "@/lib/engine/model-provider";
import { loadFxMarket } from "@/lib/engine/fx-market";
import { evaluateInvoice } from "@/lib/engine/pipeline";
import { evaluateBatch } from "@/lib/engine/pipeline";
import { assignProject } from "@/lib/engine/project-matcher";
import { effectiveRules, INITIAL_PROJECTS, scopeFor } from "@/lib/mock-data/projects";
import { paymentDate } from "@/lib/mock-data/fx-ledger";
import { sha256Bytes, sha256Hex } from "@/lib/engine/sha256";
import { matchVendor } from "@/lib/mock-data/company-rules";
import { rememberDocument } from "@/lib/inbound/documents";
import { pushOpenClawEvent } from "@/lib/openclaw/constants";
import { rememberArrival } from "@/lib/session-inbox";
import type { AuditRecord, CompanyRules, DocumentKind, FxRate, IntakeChannel, Invoice, PriorDocument, Project } from "@/types/blinka";

export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

export function bytesFromBase64(value: string): { bytes: Uint8Array; mime?: string } {
  const match = value.match(/^data:([^;]+);base64,([\s\S]*)$/);
  const payload = (match?.[2] ?? value).replace(/\s/g, "");
  return { bytes: Uint8Array.from(Buffer.from(payload, "base64")), mime: match?.[1] };
}

export function attachmentFrom(value: unknown): { bytes?: Uint8Array; mime?: string; filename?: string; text?: string } {
  if (!value || typeof value !== "object") return {};
  const payload = value as { text?: unknown; media?: unknown; mime?: unknown; filename?: unknown };
  const text = typeof payload.text === "string" ? payload.text : undefined;
  if (typeof payload.media !== "string" || !payload.media.trim()) return { text };
  const decoded = bytesFromBase64(payload.media);
  return {
    text,
    bytes: decoded.bytes,
    mime: (typeof payload.mime === "string" && payload.mime) || decoded.mime,
    filename: typeof payload.filename === "string" ? payload.filename : undefined,
  };
}

export type IngestChannel = "pdf" | "chat" | "email";

export interface IngestOutcome {
  invoice: Invoice;
  record: AuditRecord;
  timings: LayerTiming[];
  raw: {
    extraction: unknown;
    jev: unknown;
    explanation: unknown;
    record: AuditRecord;
  };
  explanation: { text: string; mode: "live" | "fallback" };
}

function priorState(
  existing: Invoice[],
  rules: CompanyRules,
  asOf: string,
  market: FxRate[],
  projects?: Project[],
): { priors: PriorDocument[]; spent: number; spentByProject: Record<string, number> } {
  const priors: PriorDocument[] = [];
  let spent = 0;
  const spentByProject: Record<string, number> = {};
  const records = evaluateBatch(existing, rules, [], asOf, market, undefined, projects);
  for (const [index, invoice] of existing.entries()) {
    const record = records[index];
    priors.push({
      invoiceNumber: invoice.invoiceNumber,
      vendorId: invoice.vendorId,
      documentHash: invoice.documentHash,
    });
    if (record.finalStatus === "APPROVED") {
      spent = Number((spent + record.totalPayableUsd).toFixed(2));
      if (invoice.projectId) spentByProject[invoice.projectId] = Number(((spentByProject[invoice.projectId] ?? 0) + record.totalPayableUsd).toFixed(2));
    }
  }
  return { priors, spent, spentByProject };
}

function kindFor(channel: IngestChannel, mime?: string): { documentKind: DocumentKind; documentLabel: string } {
  if (mime === "application/pdf") {
    return {
      documentKind: "pdf",
      documentLabel: channel === "email" ? "PDF recibido por correo" : "PDF recibido",
    };
  }
  if (mime?.startsWith("image/")) {
    return { documentKind: "handwritten", documentLabel: "Imagen recibida" };
  }
  if (channel === "email") return { documentKind: "chat", documentLabel: "Correo recibido" };
  if (channel === "chat") return { documentKind: "chat", documentLabel: "Mensaje de chat" };
  return { documentKind: "pdf", documentLabel: "Documento recibido" };
}

function intakeFor(channel: IngestChannel): IntakeChannel {
  if (channel === "email") return "email";
  if (channel === "chat") return "chat";
  return "upload";
}

function evidenceFor(channel: IngestChannel, text: string | undefined, fallback: string): string {
  const body = text?.trim();
  if (channel !== "email" || !body) return fallback;
  const excerpt = body.length > 1500 ? `${body.slice(0, 1500)}…` : body;
  return `${fallback}\n${excerpt}`;
}

function withPreview(invoice: Invoice, bytes?: Uint8Array, mime?: string): Invoice {
  if (!bytes?.byteLength) return invoice;
  rememberDocument(invoice.id, bytes, mime || (invoice.documentKind === "pdf" ? "application/pdf" : "image/jpeg"));
  return { ...invoice, documentPath: `/api/documents/${encodeURIComponent(invoice.id)}` };
}

function receivedId(channel: IngestChannel, hash: string, existing: Invoice[]): string {
  const prefix = channel === "pdf" ? "PDF" : channel === "chat" ? "CHAT" : "MAIL";
  let id = `${prefix}-${hash.slice(0, 10)}`;
  if (existing.some((invoice) => invoice.id === id)) id = `${id}-${existing.length}`;
  return id;
}

function unreadableOutcome(
  input: {
    channel: IngestChannel;
    text?: string;
    bytes?: Uint8Array;
    mime?: string;
    rules: CompanyRules;
    existing: Invoice[];
    projects?: Project[];
  },
  read: Extract<DocumentRead, { ok: false }>,
  extractMs: number,
  asOf: string,
  market: FxRate[],
): IngestOutcome {
  const hash = input.bytes && input.bytes.byteLength > 0 ? sha256Bytes(input.bytes) : sha256Hex(input.text ?? "");
  const visual = kindFor(input.channel, input.mime);
  const partial = read.partial;
  const invoice: Invoice = {
    id: receivedId(input.channel, hash, input.existing),
    invoiceNumber: partial.invoiceNumber?.trim() || `ILEGIBLE-${hash.slice(0, 8)}`,
    vendorId: "vendor-unlisted",
    vendorName: partial.vendorName?.trim() || "Sin proveedor legible",
    issueDate: partial.issueDate || "sin-fecha",
    currency: partial.currency ?? "XXX",
    subtotal: partial.subtotal ?? 0,
    taxAmount: partial.taxAmount ?? 0,
    totalPayable: partial.totalPayable && partial.totalPayable > 0 ? partial.totalPayable : 0,
    documentHash: hash,
    description: partial.description?.trim() || "Documento recibido sin total, fecha o moneda auditables.",
    documentKind: visual.documentKind,
    documentLabel: "Documento recibido",
    documentPath: "",
    periodKey: partial.issueDate?.slice(0, 7) || "",
    lineItems: partial.description?.trim() ? [partial.description.trim()] : [],
    evidenceNote: evidenceFor(input.channel, input.text, `Documento recibido por ${input.channel}. ${read.reason}`),
    intakeChannel: intakeFor(input.channel),
    receivedAt: new Date().toISOString(),
    extractionValid: false,
    extractionNote: read.reason,
    jevSnapshot: null,
  };
  const projects = input.projects ?? INITIAL_PROJECTS;
  const { priors, spent, spentByProject } = priorState(input.existing, input.rules, asOf, market, projects);
  const resolved = scopeFor(invoice, projects, invoice.projectId ? (spentByProject[invoice.projectId] ?? 0) : 0);
  const record = evaluateInvoice(invoice, effectiveRules(input.rules, resolved.rulesOverlay), priors, spent, null, [], asOf, market, undefined, resolved.scope);
  return {
    invoice,
    record,
    timings: [
      {
        layer: "extract",
        ms: extractMs,
        mode: "live",
        model: read.model,
        detail: read.reason,
      },
      { layer: "rules", ms: 1, mode: "local", detail: record.finalStatus },
      { layer: "jev", ms: 0, mode: "skipped", detail: "JEV no corre: la lectura no es auditable." },
      { layer: "explain", ms: 0, mode: "fallback", detail: "Texto determinista." },
    ],
    raw: {
      extraction: read.raw,
      jev: { skipped: true },
      explanation: { text: record.explanation },
      record,
    },
    explanation: { text: record.explanation, mode: "fallback" },
  };
}

function invoiceFromPartial(
  input: { channel: IngestChannel; text?: string; bytes?: Uint8Array; mime?: string; existing: Invoice[] },
  partial: PartialExtraction & { currency: Invoice["currency"]; totalPayable: number; issueDate: string },
  hash: string,
  lineCheck?: string,
): Invoice {
  const vendor = matchVendor(partial.vendorName ?? "");
  const visual = kindFor(input.channel, input.mime);
  return {
    id: receivedId(input.channel, hash, input.existing),
    invoiceNumber: partial.invoiceNumber?.trim() || `REC-${hash.slice(0, 8)}`,
    vendorId: vendor?.id ?? "vendor-unlisted",
    vendorName: vendor?.legalName ?? partial.vendorName?.trim() ?? "Sin proveedor legible",
    issueDate: partial.issueDate,
    currency: partial.currency,
    subtotal: partial.subtotal ?? partial.totalPayable,
    taxAmount: partial.taxAmount ?? 0,
    totalPayable: partial.totalPayable,
    documentHash: hash,
    description: partial.description?.trim() || "Documento recibido con campos incompletos.",
    paymentAccountIdentifier: partial.paymentAccountIdentifier,
    projectReference: partial.projectReference,
    documentKind: visual.documentKind,
    documentLabel: "Documento recibido",
    documentPath: "",
    periodKey: partial.issueDate.slice(0, 7),
    lineItems: [partial.description?.trim() || "Documento recibido"],
    evidenceNote: evidenceFor(
      input.channel,
      input.text,
      `Documento recibido por ${input.channel}. ${lineCheck ?? "Las reglas usan el total impreso."}`,
    ),
    intakeChannel: intakeFor(input.channel),
    receivedAt: new Date().toISOString(),
    lineCheck,
    jevSnapshot: null,
  };
}

export async function ingestIncoming(input: {
  channel: IngestChannel;
  text?: string;
  bytes?: Uint8Array;
  mime?: string;
  filename?: string;
  rules: CompanyRules;
  keys: ByokKeys;
  existing: Invoice[];
  projects?: Project[];
  vendorAccounts?: Record<string, string[]>;
}): Promise<IngestOutcome> {
  if (input.bytes && input.bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error("El archivo supera 4 MB.");
  }
  const keys = resolveKeys(input.keys);
  const asOf = paymentDate();
  const market = await loadFxMarket(asOf);
  const started = performance.now();
  const read = await extractDocument(
    { text: input.text, bytes: input.bytes, mime: input.mime, filename: input.filename },
    keys,
  );
  const extractMs = Math.max(1, Math.round(performance.now() - started));
  const hash = input.bytes && input.bytes.byteLength > 0 ? sha256Bytes(input.bytes) : sha256Hex(input.text ?? "");
  if (!read.ok && !payableIsAuditable(read.partial)) {
    const outcome = unreadableOutcome(input, read, extractMs, asOf, market);
    outcome.invoice = withPreview(outcome.invoice, input.bytes, input.mime);
    return outcome;
  }
  const auditable = !read.ok && payableIsAuditable(read.partial) ? read.partial : null;
  const vendor = read.ok ? matchVendor(read.extraction.vendorName) : null;
  const visual = kindFor(input.channel, input.mime);
  let invoice: Invoice = read.ok
    ? {
        id: receivedId(input.channel, hash, input.existing),
        invoiceNumber: read.extraction.invoiceNumber,
        vendorId: vendor?.id ?? "vendor-unlisted",
        vendorName: vendor?.legalName ?? read.extraction.vendorName,
        issueDate: read.extraction.issueDate,
        currency: read.extraction.currency,
        subtotal: read.extraction.subtotal,
        taxAmount: read.extraction.taxAmount,
        totalPayable: read.extraction.totalPayable,
        documentHash: hash,
        description: read.extraction.description,
        projectReference: read.extraction.projectReference,
        paymentAccountIdentifier: read.extraction.paymentAccountIdentifier,
        documentKind: visual.documentKind,
        documentLabel: visual.documentLabel,
        documentPath: "",
        periodKey: read.extraction.issueDate.slice(0, 7),
        lineItems: [read.extraction.description],
        evidenceNote: evidenceFor(input.channel, input.text, `Documento sintético recibido por ${input.channel}.`),
        intakeChannel: intakeFor(input.channel),
        jevSnapshot: null,
      }
    : invoiceFromPartial(input, auditable!, hash, read.lineCheck);
  const extractedModel = read.model;
  const extractedRaw = read.raw;
  const extractDetail = read.ok
    ? "Extracción Zod válida."
    : "Documento recibido. El total impreso entra a las reglas.";

  const projects = input.projects ?? INITIAL_PROJECTS;
  invoice = assignProject(invoice, projects);
  if (invoice.paymentAccountIdentifier) {
    const fallbackAccount = vendor?.bankAccountLast4 && vendor.bankAccountLast4 !== "0000" ? [`SYN-${vendor.bankAccountLast4}`] : [];
    const registered = input.vendorAccounts?.[invoice.vendorId] ?? fallbackAccount;
    if (registered.length > 0) invoice.bankAccountCheck = compareBankAccount(invoice.paymentAccountIdentifier, registered);
  }
  const { priors, spent, spentByProject } = priorState(input.existing, input.rules, asOf, market, projects);
  const resolved = scopeFor(invoice, projects, invoice.projectId ? (spentByProject[invoice.projectId] ?? 0) : 0);
  const appliedRules = effectiveRules(input.rules, resolved.rulesOverlay);
  const rulesStarted = performance.now();
  const { hard } = evaluateHardRules(invoice, appliedRules, priors, spent, [], asOf, market, undefined, resolved.scope);
  const rulesMs = Math.max(1, Math.round(performance.now() - rulesStarted));

  let jevTiming: LayerTiming = {
    layer: "jev",
    ms: 0,
    mode: "skipped",
    detail: "JEV no corre: hay una regla dura en fallo.",
  };
  let jevRaw: unknown = { skipped: true };

  if (hard.passed) {
    const recent = input.existing.filter((item) => item.vendorId === invoice.vendorId);
    const jevStarted = performance.now();
    const jev = await evaluateJev(invoice, recent, keys);
    jevRaw = jev.raw;
    if (jev.result) invoice.jevSnapshot = jev.result;
    jevTiming = {
      layer: "jev",
      ms: jev.result?.latencyMs ?? Math.max(1, Math.round(performance.now() - jevStarted)),
      mode: jev.mode,
      detail: jev.error ?? (jev.result ? (jev.mode === "live" ? "JEV en vivo." : "Snapshot JEV.") : "JEV no se consultó."),
    };
  }

  const record = evaluateInvoice(invoice, appliedRules, priors, spent, hard.passed ? invoice.jevSnapshot : null, [], asOf, market, undefined, resolved.scope);
  const explainStarted = performance.now();
  const explanation = await explainDecision(record, keys);
  const outcome: IngestOutcome = {
    invoice,
    record,
    timings: [
      {
        layer: "extract",
        ms: extractMs,
        mode: "live",
        model: extractedModel,
        detail: extractDetail,
      },
      { layer: "rules", ms: rulesMs, mode: "local", detail: record.finalStatus },
      jevTiming,
      {
        layer: "explain",
        ms: Math.max(1, Math.round(performance.now() - explainStarted)),
        mode: explanation.mode,
        model: explanation.model,
        detail: explanation.error ?? (explanation.mode === "live" ? "Explicación del modelo." : "Texto determinista."),
      },
    ],
    raw: {
      extraction: extractedRaw,
      jev: jevRaw,
      explanation: explanation.raw,
      record,
    },
    explanation: { text: explanation.text, mode: explanation.mode },
  };
  outcome.invoice = withPreview(outcome.invoice, input.bytes, input.mime);
  return outcome;
}

export function publishVerdict(channel: IngestChannel, outcome: IngestOutcome) {
  rememberArrival({
    invoice: outcome.invoice,
    timings: outcome.timings,
    raw: outcome.raw,
    explanation: outcome.explanation,
  });
  const shared = {
    channel,
    totalPayableUsd: outcome.record.totalPayableUsd,
    status: outcome.record.finalStatus,
    auditHash: outcome.record.auditHash,
    explanation: outcome.explanation.text,
  };
  if (outcome.record.finalStatus === "APPROVED") {
    return pushOpenClawEvent({ kind: "approval", invoiceId: outcome.invoice.id, payload: shared });
  }
  if (outcome.record.finalStatus === "ESCALATED") {
    return pushOpenClawEvent({ kind: "escalation", invoiceId: outcome.invoice.id, payload: shared });
  }
  return pushOpenClawEvent({
    kind: "ingest",
    invoiceId: outcome.invoice.id,
    payload: { ...shared, reasons: outcome.record.hardRulesResult.reasons },
  });
}
