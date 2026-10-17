import { ingestIncoming, MAX_DOCUMENT_BYTES, publishVerdict } from "@/lib/engine/ingest";
import { takeLiveSlot } from "@/lib/engine/live-budget";
import type { GmailStatus, MailLogEntry } from "@/lib/inbound/types";
import { INITIAL_DATASET } from "@/lib/mock-data/initial-dataset";
import { arrivedInvoices, sessionRules } from "@/lib/session-inbox";

const MAX_UNREAD = 5;
const LOG_CAP = 30;
const TEXT_CAP = 4000;
const SIGNATURE_BYTES = 30 * 1024;

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

type GmailMemory = {
  seen: Set<string>;
  attempts: Map<string, number>;
  messages: MailLogEntry[];
  lastPollAt: string | null;
  lastError: string | null;
  inflight: Promise<GmailStatus> | null;
};

declare global {
  var blinkaGmail: GmailMemory | undefined;
}

function memory(): GmailMemory {
  globalThis.blinkaGmail ??= { seen: new Set(), attempts: new Map(), messages: [], lastPollAt: null, lastError: null, inflight: null };
  globalThis.blinkaGmail.attempts ??= new Map();
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
    messages: current.messages.map((item) => ({ ...item, invoiceIds: [...item.invoiceIds], attachments: [...item.attachments] })),
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

function pushLog(entry: MailLogEntry) {
  const current = memory();
  current.messages.unshift(entry);
  if (current.messages.length > LOG_CAP) current.messages.length = LOG_CAP;
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
  if (!(part.filename ?? "").trim()) return true;
  return /inline/i.test(header(part, "content-disposition")) && size > 0 && size < SIGNATURE_BYTES;
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

async function listUnread(token: string): Promise<string[]> {
  const query = new URLSearchParams({ q: "is:unread", maxResults: String(MAX_UNREAD) });
  const body = (await gmailGet(token, `messages?${query.toString()}`)) as { messages?: Array<{ id?: string }> };
  return (body.messages ?? []).map((item) => item.id).filter((id): id is string => Boolean(id));
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
      if (bytes.byteLength > MAX_DOCUMENT_BYTES) bag.skipped.push(filename || normalized);
      else if (bytes.byteLength > 0) {
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

async function markRead(token: string, id: string) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}/modify`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
  if (!response.ok) throw new Error(`Gmail respondió ${response.status}.`);
}

async function markReadSafe(token: string, id: string) {
  try {
    await markRead(token, id);
  } catch {
    return;
  }
}

function messageText(parsed: ParsedMail): string {
  return [`De: ${parsed.from}`, `Asunto: ${parsed.subject}`, parsed.text].filter(Boolean).join("\n");
}

async function handleMessage(token: string, id: string, ip: string): Promise<string | null> {
  const current = memory();
  if (current.seen.has(id)) {
    const prior = current.messages.find((item) => item.id === id);
    const attempts = current.attempts.get(id) ?? 1;
    if (!prior || prior.status === "ingested" || attempts >= 2) {
      await markReadSafe(token, id);
      return null;
    }
    current.attempts.set(id, attempts + 1);
    current.seen.delete(id);
  }
  const parsed = await readMessage(token, id);
  const text = messageText(parsed);
  const at = new Date().toISOString();
  const attachments = parsed.files.map((file) => file.filename);
  if (parsed.files.length === 0 && !textLooksLikePayable(text)) {
    current.seen.add(id);
    await markReadSafe(token, id);
    const reason = parsed.skipped.length > 0 ? "El archivo supera 4 MB." : "Sin adjunto de cobro ni monto.";
    pushLog({ id, at, from: parsed.from, subject: parsed.subject, attachments, status: "discarded", reason, invoiceIds: [] });
    return null;
  }

  const targets: Array<PayableFile | null> = parsed.files.length > 0 ? parsed.files : [null];
  const invoiceIds: string[] = [];
  const reasons: string[] = [];
  if (parsed.skipped.length > 0) reasons.push("Un adjunto supera 4 MB.");
  let modelAttempted = false;
  let failed = false;
  for (const file of targets) {
    const limited = takeLiveSlot(ip);
    if (limited) {
      if (!modelAttempted) {
        pushLog({ id, at, from: parsed.from, subject: parsed.subject, attachments, status: "error", reason: limited, invoiceIds });
        return limited;
      }
      reasons.push(limited);
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
        reasons.push(outcome.invoice.extractionNote || "La lectura no dejó un total auditable.");
        continue;
      }
      publishVerdict("email", outcome);
      invoiceIds.push(outcome.invoice.id);
    } catch (error) {
      failed = true;
      reasons.push(error instanceof Error ? error.message : "No se pudo leer el correo.");
    }
  }

  current.seen.add(id);
  await markReadSafe(token, id);
  pushLog({
    id,
    at,
    from: parsed.from,
    subject: parsed.subject,
    attachments,
    status: invoiceIds.length > 0 ? "ingested" : failed ? "error" : "discarded",
    reason: reasons.length > 0 ? reasons.join(" ") : undefined,
    invoiceIds,
  });
  return null;
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
    const ids = await listUnread(token);
    let stop: string | null = null;
    for (const id of ids) {
      if (stop) break;
      stop = await handleMessage(token, id, ip);
    }
    current.lastError = stop;
  } catch (error) {
    current.lastError = error instanceof Error ? error.message : "No se pudo leer Gmail.";
  }
  current.lastPollAt = new Date().toISOString();
  return gmailStatus();
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
