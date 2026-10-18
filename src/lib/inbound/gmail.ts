import { ingestIncoming, MAX_DOCUMENT_BYTES, publishVerdict } from "@/lib/engine/ingest";
import { takeLiveSlot } from "@/lib/engine/live-budget";
import type { GmailStatus, MailInvoicePiece, MailLogEntry } from "@/lib/inbound/types";
import { INITIAL_DATASET } from "@/lib/mock-data/initial-dataset";
import { arrivedInvoices, sessionRules } from "@/lib/session-inbox";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const MAX_LIST = 20;
const MAX_NEW = 5;
const LOG_CAP = 30;
const TEXT_CAP = 4000;
const SIGNATURE_BYTES = 30 * 1024;
const LABEL_INGESTED = "blinka-ingested";
const LABEL_SKIPPED = "blinka-omitido";

type GmailConfig = {
  user: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

type GmailHeader = { name?: string; value?: string };

type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: GmailPart[];
};

type PayableFile = { filename: string; mime: string; bytes: Uint8Array };

type ParsedMail = {
  from: string;
  subject: string;
  plain: string;
  html: string;
  text: string;
  files: PayableFile[];
  skipped: string[];
};

type LabelCache = { ingested: string | null; skipped: string | null };

type MailVerdict = { reason: string; invoiceIds: string[]; status: MailLogEntry["status"]; invoices?: MailInvoicePiece[] };

type GmailMemory = {
  seen: Set<string>;
  labeled: Set<string>;
  messages: MailLogEntry[];
  verdicts: Record<string, MailVerdict>;
  lastPollAt: string | null;
  lastError: string | null;
  inflight: Promise<GmailStatus> | null;
  labelIds: LabelCache;
};

declare global {
  var blinkaGmail: GmailMemory | undefined;
}

function verdictFile(): string {
  return path.join(process.cwd(), "data", "mail-decisions.json");
}

function readVerdicts(): Record<string, MailVerdict> {
  try {
    const parsed = JSON.parse(readFileSync(verdictFile(), "utf8")) as Record<string, MailVerdict>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function rememberVerdict(id: string, verdict: MailVerdict) {
  const current = memory();
  current.verdicts[id] = verdict;
  try {
    mkdirSync(path.dirname(verdictFile()), { recursive: true });
    writeFileSync(verdictFile(), JSON.stringify(current.verdicts));
  } catch {
    // The process still keeps the decision until it restarts.
  }
}

function withVerdict(entry: MailLogEntry, verdicts: Record<string, MailVerdict>): MailLogEntry {
  const cleaned = entry.reason && /sondeo anterior|próximo sondeo/.test(entry.reason) ? { ...entry, reason: undefined } : entry;
  const saved = verdicts[cleaned.id];
  if (!saved?.reason) return cleaned;
  return {
    ...cleaned,
    status: saved.status,
    reason: saved.reason,
    invoiceIds: saved.invoiceIds.length > 0 ? saved.invoiceIds : cleaned.invoiceIds,
    invoices: saved.invoices?.length ? saved.invoices : cleaned.invoices,
  };
}

function memory(): GmailMemory {
  globalThis.blinkaGmail ??= {
    seen: new Set(),
    labeled: new Set(),
    messages: [],
    verdicts: readVerdicts(),
    lastPollAt: null,
    lastError: null,
    inflight: null,
    labelIds: { ingested: null, skipped: null },
  };
  globalThis.blinkaGmail.labeled ??= new Set();
  globalThis.blinkaGmail.labelIds ??= { ingested: null, skipped: null };
  globalThis.blinkaGmail.verdicts ??= readVerdicts();
  return globalThis.blinkaGmail;
}

function gmailConfig(): GmailConfig | null {
  const user = process.env.GMAIL_USER?.trim() ?? "";
  const clientId = process.env.GMAIL_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim() ?? "";
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim() ?? "";
  if (!user || !clientId || !clientSecret || !refreshToken) return null;
  return { user, clientId, clientSecret, refreshToken };
}

export function gmailStatus(): GmailStatus {
  const current = memory();
  const config = gmailConfig();
  return {
    connected: Boolean(config),
    address: config?.user ?? null,
    lastPollAt: current.lastPollAt,
    lastError: current.lastError,
    messages: current.messages.map((item) => ({
      ...item,
      invoiceIds: [...item.invoiceIds],
      attachments: [...item.attachments],
      invoices: item.invoices?.map((invoice) => ({ ...invoice })),
    })),
  };
}

const PAYABLE_AMOUNT = String.raw`\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d+[.,]\d{2}|\d{2,}`;

export function textLooksLikePayable(text: string): boolean {
  const money = new RegExp(
    String.raw`(?:usd|cop|mxn|ves|ars|eur|\$|€)\s*(?:${PAYABLE_AMOUNT})|(?:${PAYABLE_AMOUNT})\s*(?:usd|cop|mxn|ves|ars|eur)`,
    "i",
  );
  const labeled = new RegExp(String.raw`\b(?:total|subtotal|monto|importe)\b[^\d]{0,24}(?:${PAYABLE_AMOUNT})`, "i");
  return money.test(text) || labeled.test(text);
}


function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Uint8Array.from(Buffer.from(normalized + pad, "base64"));
}

function decodeText(value: string): string {
  return Buffer.from(decodeBase64Url(value)).toString("utf8");
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function header(part: GmailPart, name: string): string {
  return part.headers?.find((item) => item.name?.toLowerCase() === name)?.value?.trim() ?? "";
}

function payableMime(mime: string, filename: string): string | null {
  const name = filename.toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "application/pdf";
  if (mime === "image/png" || name.endsWith(".png")) return "image/png";
  if (mime === "image/jpeg" || mime === "image/jpg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (mime === "image/webp" || name.endsWith(".webp")) return "image/webp";
  return null;
}

function isSignature(part: GmailPart, size: number): boolean {
  const mime = (part.mimeType ?? "").toLowerCase();
  if (!mime.startsWith("image/")) return false;
  if ((part.filename ?? "").trim()) return false;
  if (size <= 0) return false;
  return size < SIGNATURE_BYTES;
}

function clip(current: string, next: string): string {
  if (current.length >= TEXT_CAP) return current;
  return `${current}${current ? "\n" : ""}${next}`.slice(0, TEXT_CAP);
}

function defaultName(mime: string): string {
  if (mime === "application/pdf") return "adjunto.pdf";
  if (mime === "image/png") return "adjunto.png";
  if (mime === "image/webp") return "adjunto.webp";
  return "adjunto.jpg";
}

async function accessToken(config: GmailConfig): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error("No se pudo renovar el acceso a Gmail.");
  const body = (await response.json().catch(() => null)) as { access_token?: string } | null;
  if (!body?.access_token) throw new Error("No se pudo renovar el acceso a Gmail.");
  return body.access_token;
}

async function gmailGet(token: string, path: string): Promise<unknown> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Gmail respondió ${response.status}.`);
  return response.json();
}

async function gmailSend(token: string, path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Gmail respondió ${response.status}.`);
  return response.json().catch(() => ({}));
}

async function createLabel(token: string, name: string): Promise<string> {
  const created = (await gmailSend(token, "labels", {
    name,
    labelListVisibility: "labelHide",
    messageListVisibility: "hide",
  })) as { id?: string };
  if (!created.id) throw new Error("No se pudo crear la etiqueta de Gmail.");
  return created.id;
}

async function ensureLabels(token: string): Promise<{ ingested: string; skipped: string }> {
  const cache = memory().labelIds;
  if (cache.ingested && cache.skipped) return { ingested: cache.ingested, skipped: cache.skipped };
  const listed = (await gmailGet(token, "labels")) as { labels?: Array<{ id?: string; name?: string }> };
  const find = (name: string) => listed.labels?.find((item) => item.name === name)?.id ?? null;
  const ingested = find(LABEL_INGESTED) ?? (await createLabel(token, LABEL_INGESTED));
  const skipped = find(LABEL_SKIPPED) ?? (await createLabel(token, LABEL_SKIPPED));
  cache.ingested = ingested;
  cache.skipped = skipped;
  return { ingested, skipped };
}

async function listRecent(token: string): Promise<string[]> {
  const query = new URLSearchParams({ q: "in:inbox newer_than:2d", maxResults: String(MAX_LIST) });
  const body = (await gmailGet(token, `messages?${query.toString()}`)) as { messages?: Array<{ id?: string }> };
  return (body.messages ?? []).map((item) => item.id).filter((id): id is string => Boolean(id));
}

type MailMeta = { from: string; subject: string; at: string; labelIds: string[] };

async function readMeta(token: string, id: string): Promise<MailMeta> {
  const body = (await gmailGet(
    token,
    `messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
  )) as { internalDate?: string; labelIds?: string[]; payload?: GmailPart };
  const millis = Number(body.internalDate);
  return {
    from: header(body.payload ?? {}, "from") || "remitente desconocido",
    subject: header(body.payload ?? {}, "subject") || "Sin asunto",
    at: Number.isFinite(millis) ? new Date(millis).toISOString() : new Date().toISOString(),
    labelIds: body.labelIds ?? [],
  };
}

async function attachmentBytes(token: string, messageId: string, attachmentId: string): Promise<Uint8Array> {
  const body = (await gmailGet(
    token,
    `messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  )) as { data?: string };
  if (!body.data) return new Uint8Array();
  return decodeBase64Url(body.data);
}

async function collectParts(token: string, messageId: string, part: GmailPart, bag: ParsedMail) {
  const mime = (part.mimeType ?? "").toLowerCase();
  if (mime === "text/plain" && part.body?.data) bag.plain = clip(bag.plain, decodeText(part.body.data));
  if (mime === "text/html" && part.body?.data) bag.html = clip(bag.html, decodeText(part.body.data));
  const filename = part.filename?.trim() ?? "";
  const normalized = payableMime(mime, filename);
  const size = part.body?.size ?? 0;
  if (normalized && !isSignature(part, size)) {
    if (size > MAX_DOCUMENT_BYTES) {
      bag.skipped.push(filename || normalized);
    } else {
      let bytes = part.body?.data ? decodeBase64Url(part.body.data) : new Uint8Array();
      if (bytes.byteLength === 0 && part.body?.attachmentId) {
        bytes = await attachmentBytes(token, messageId, part.body.attachmentId);
      }
      const tinyUnnamed = !filename && normalized.startsWith("image/") && bytes.byteLength > 0 && bytes.byteLength < SIGNATURE_BYTES;
      if (bytes.byteLength > MAX_DOCUMENT_BYTES) bag.skipped.push(filename || normalized);
      else if (bytes.byteLength > 0 && !tinyUnnamed) {
        bag.files.push({ filename: filename || defaultName(normalized), mime: normalized, bytes });
      }
    }
  }
  for (const child of part.parts ?? []) await collectParts(token, messageId, child, bag);
}

async function readMessage(token: string, id: string): Promise<ParsedMail> {
  const body = (await gmailGet(token, `messages/${encodeURIComponent(id)}?format=full`)) as { payload?: GmailPart };
  const payload = body.payload ?? {};
  const parsed: ParsedMail = {
    from: header(payload, "from") || "remitente desconocido",
    subject: header(payload, "subject") || "Sin asunto",
    plain: "",
    html: "",
    text: "",
    files: [],
    skipped: [],
  };
  await collectParts(token, id, payload, parsed);
  const prose = parsed.plain.trim() || htmlToText(parsed.html);
  parsed.text = prose.length > TEXT_CAP ? `${prose.slice(0, TEXT_CAP)}…` : prose;
  return parsed;
}

type HandleResult = {
  entry: MailLogEntry;
  stop: string | null;
  label: "ingested" | "skipped" | null;
};

async function markProcessed(token: string, id: string, labelId: string) {
  await gmailSend(token, `messages/${encodeURIComponent(id)}/modify`, {
    removeLabelIds: ["UNREAD"],
    addLabelIds: [labelId],
  });
}

async function markProcessedSafe(token: string, id: string, labelId: string) {
  try {
    await markProcessed(token, id, labelId);
  } catch {
    return;
  }
}

function messageText(parsed: ParsedMail): string {
  return [`De: ${parsed.from}`, `Asunto: ${parsed.subject}`, parsed.text].filter(Boolean).join("\n");
}

function shell(id: string, meta: MailMeta, status: MailLogEntry["status"], reason: string): MailLogEntry {
  return {
    id,
    at: meta.at,
    from: meta.from,
    subject: meta.subject,
    attachments: [],
    status,
    reason,
    invoiceIds: [],
  };
}

async function handleMessage(token: string, id: string, ip: string): Promise<HandleResult> {
  const current = memory();
  const prior = current.messages.find((item) => item.id === id);
  if (current.seen.has(id) && prior && prior.status !== "pending") {
    return { entry: prior, stop: null, label: null };
  }
  const parsed = await readMessage(token, id);
  const text = messageText(parsed);
  const at = new Date().toISOString();
  const attachments = parsed.files.map((file) => file.filename);
  if (parsed.files.length === 0 && !textLooksLikePayable(text)) {
    current.seen.add(id);
    const reason = parsed.skipped.length > 0 ? "El archivo supera 4 MB." : "Sin adjunto de cobro ni monto.";
    return {
      entry: { id, at, from: parsed.from, subject: parsed.subject, attachments, status: "discarded", reason, invoiceIds: [] },
      stop: null,
      label: "skipped",
    };
  }

  const targets: Array<PayableFile | null> = parsed.files.length > 0 ? parsed.files : [null];
  const invoiceIds: string[] = [];
  const invoices: MailInvoicePiece[] = [];
  const reasons: string[] = [];
  if (parsed.skipped.length > 0) reasons.push("Un adjunto supera 4 MB.");
  let modelAttempted = false;
  let failed = false;
  for (const file of targets) {
    const limited = takeLiveSlot(ip);
    if (limited) {
      if (!modelAttempted) {
        return {
          entry: { id, at, from: parsed.from, subject: parsed.subject, attachments, status: "pending", reason: limited, invoiceIds },
          stop: limited,
          label: null,
        };
      }
      reasons.push(limited);
      invoices.push({ invoiceId: "", filename: file?.filename || "Adjunto", reason: limited });
      break;
    }
    modelAttempted = true;
    try {
      const outcome = await ingestIncoming({
        channel: "email",
        text,
        bytes: file?.bytes,
        mime: file?.mime,
        filename: file?.filename,
        rules: sessionRules(),
        keys: {},
        existing: [...INITIAL_DATASET, ...arrivedInvoices()],
      });
      if (outcome.invoice.extractionValid === false) {
        const note = outcome.invoice.extractionNote || "La lectura no dejó un total auditable.";
        reasons.push(note);
        invoices.push({ invoiceId: "", filename: file?.filename || "Correo", reason: note });
        continue;
      }
      publishVerdict("email", outcome);
      invoiceIds.push(outcome.invoice.id);
      invoices.push({
        invoiceId: outcome.invoice.id,
        filename: file?.filename || outcome.invoice.documentLabel || "Factura",
        reason: outcome.record.explanation,
      });
    } catch (error) {
      failed = true;
      const note = error instanceof Error ? error.message : "No se pudo leer el correo.";
      reasons.push(note);
      invoices.push({ invoiceId: "", filename: file?.filename || "Adjunto", reason: note });
    }
  }

  const status = invoiceIds.length > 0 ? "ingested" : failed ? "error" : "discarded";
  const reason = invoices.length === 1 ? invoices[0]?.reason : reasons.length > 0 ? reasons.join(" ") : undefined;
  if (invoices.length > 0 || reason) rememberVerdict(id, { reason: reason ?? "", invoiceIds, status, invoices });
  if (status !== "error") current.seen.add(id);
  return {
    entry: {
      id,
      at,
      from: parsed.from,
      subject: parsed.subject,
      attachments,
      status,
      reason,
      invoiceIds,
      invoices,
    },
    stop: null,
    label: status === "ingested" ? "ingested" : status === "discarded" ? "skipped" : null,
  };
}

async function runPoll(ip: string): Promise<GmailStatus> {
  const current = memory();
  const config = gmailConfig();
  if (!config) {
    current.lastPollAt = new Date().toISOString();
    current.lastError = "Gmail no está configurado.";
    return gmailStatus();
  }
  try {
    const token = await accessToken(config);
    const labels = await ensureLabels(token);
    const ids = await listRecent(token);
    const byId = new Map(current.messages.map((item) => [item.id, item]));
    const next: MailLogEntry[] = [];
    let fresh = 0;
    let stop: string | null = null;
    for (const id of ids) {
      const prior = byId.get(id);
      if (prior && prior.status !== "pending") {
        next.push(withVerdict(prior, current.verdicts));
        if ((prior.status === "ingested" || prior.status === "discarded") && !current.labeled.has(id)) {
          await markProcessedSafe(token, id, prior.status === "ingested" ? labels.ingested : labels.skipped);
          current.labeled.add(id);
        }
        continue;
      }
      const meta = await readMeta(token, id);
      if (meta.labelIds.includes(labels.ingested)) {
        next.push(withVerdict(shell(id, meta, "ingested", ""), current.verdicts));
        current.labeled.add(id);
        continue;
      }
      if (meta.labelIds.includes(labels.skipped)) {
        next.push(withVerdict(shell(id, meta, "discarded", ""), current.verdicts));
        current.labeled.add(id);
        continue;
      }
      if (stop || fresh >= MAX_NEW) {
        next.push(shell(id, meta, "pending", stop ?? "En espera del próximo sondeo."));
        continue;
      }
      fresh += 1;
      try {
        const result = await handleMessage(token, id, ip);
        next.push(result.entry);
        if (result.label === "ingested") await markProcessedSafe(token, id, labels.ingested);
        if (result.label === "skipped") await markProcessedSafe(token, id, labels.skipped);
        if (result.label) current.labeled.add(id);
        if (result.stop) stop = result.stop;
      } catch (error) {
        next.push(shell(id, meta, "error", error instanceof Error ? error.message : "No se pudo leer el correo."));
      }
    }
    current.messages = next.slice(0, LOG_CAP);
    current.lastError = stop;
  } catch (error) {
    current.lastError = error instanceof Error ? error.message : "No se pudo leer Gmail.";
  }
  current.lastPollAt = new Date().toISOString();
  return gmailStatus();
}

export async function messageFiles(id: string): Promise<PayableFile[]> {
  const config = gmailConfig();
  if (!config || !id) return [];
  const token = await accessToken(config);
  const parsed = await readMessage(token, id);
  return parsed.files;
}

export function pollGmail(ip: string): Promise<GmailStatus> {
  const current = memory();
  if (current.inflight) return current.inflight;
  const run = runPoll(ip).finally(() => {
    memory().inflight = null;
  });
  current.inflight = run;
  return run;
}
