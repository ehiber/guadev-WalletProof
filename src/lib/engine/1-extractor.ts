import { parseIssueDate } from "@/lib/engine/dates";
import { normalizeCurrency } from "@/lib/engine/currency";
import { findVendor } from "@/lib/mock-data/company-rules";
import {
  applyExtraction,
  completeWithRetry,
  extractionFromInvoice,
  extractionSchema,
  stripJson,
  type ByokKeys,
  type ChatPart,
  type Extraction,
} from "@/lib/engine/model-provider";
import type { Invoice } from "@/types/blinka";

export interface ExtractionRun {
  invoice: Invoice;
  extraction: Extraction;
  mode: "live" | "fallback";
  model?: string;
  escalated: boolean;
  raw: unknown;
  error?: string;
}

export interface DocumentExtraction {
  extraction: Extraction;
  model?: string;
  escalated: boolean;
  raw: unknown;
}

export interface PartialExtraction {
  invoiceNumber?: string;
  vendorName?: string;
  currency?: Extraction["currency"];
  subtotal?: number;
  taxAmount?: number;
  totalPayable?: number;
  description?: string;
  issueDate?: string;
  projectReference?: string;
}

export type DocumentRead =
  | ({ ok: true } & DocumentExtraction)
      | {
      ok: false;
      partial: PartialExtraction;
      model?: string;
      escalated: boolean;
      raw: unknown;
      reason: string;
      lineCheck?: string;
    };

const READ_SYSTEM =
  "Lee una factura sintética. Responde solo JSON con invoiceNumber, vendorName, currency, subtotal, taxAmount, totalPayable, description, issueDate y, solo si aparece literalmente, projectReference. projectReference copia el nombre, código o identificador del proyecto; omítelo si no existe, sin inferirlo. currency es un código ISO 4217 o una de estas criptomonedas: BTC, ETH, USDT, USDC. Si el documento imprime un símbolo local, conviértelo: Bs, Bs., Bs.S, Bs.F, Bs.D y bolívar son VES; € o euro es EUR; R$ o real es BRL; sol, soles o S/ es PEN; colón o ₡ es CRC; peso chileno es CLP; boliviano es BOB; rand es ZAR. USDC en Base, Ethereum, Polygon, Celo o Solana sigue siendo USDC. bitcoin o ₿ es BTC; ether o ethereum es ETH; tether es USDT; USD Coin es USDC. issueDate es la fecha de emisión tal como está impresa; si trae hora, cópiala también. Copia los números impresos. No calcules dólares. No apruebes ni rechaces el pago.";

const FIELD_LABELS: Record<string, string> = {
  invoiceNumber: "número de factura",
  vendorName: "proveedor",
  currency: "moneda",
  subtotal: "subtotal",
  taxAmount: "impuestos",
  totalPayable: "total a pagar",
  description: "descripción",
  issueDate: "fecha de emisión",
};

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/\s/g, "");
  if (!trimmed) return undefined;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(trimmed)) return Number(trimmed.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(trimmed)) return Number(trimmed.replace(/,/g, ""));
  if (/^\d+,\d+$/.test(trimmed)) return Number(trimmed.replace(",", "."));
  const plain = Number(trimmed);
  return Number.isFinite(plain) ? plain : undefined;
}

function normalizePayload(value: Record<string, unknown>): Record<string, unknown> {
  const next = { ...value };
  if (typeof next.currency === "string") {
    const code = normalizeCurrency(next.currency);
    if (code) next.currency = code;
  }
  if (typeof next.issueDate === "string") {
    const date = parseIssueDate(next.issueDate);
    if (date) next.issueDate = date;
  }
  for (const key of ["subtotal", "taxAmount", "totalPayable"] as const) {
    const number = asNumber(next[key]);
    if (number !== undefined) next[key] = number;
  }
  return next;
}

function parseExtraction(text: string): Extraction | null {
  try {
    const value = JSON.parse(stripJson(text)) as unknown;
    if (!value || typeof value !== "object") return null;
    const parsed = extractionSchema.safeParse(normalizePayload(value as Record<string, unknown>));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function partialExtraction(text: string): PartialExtraction {
  try {
    const value = JSON.parse(stripJson(text)) as unknown;
    if (!value || typeof value !== "object") return {};
    const normalized = normalizePayload(value as Record<string, unknown>);
    const currency = typeof normalized.currency === "string" ? normalizeCurrency(normalized.currency) : null;
    const issueDate = typeof normalized.issueDate === "string" ? normalized.issueDate : undefined;
    return {
      invoiceNumber: typeof normalized.invoiceNumber === "string" ? normalized.invoiceNumber : undefined,
      vendorName: typeof normalized.vendorName === "string" ? normalized.vendorName : undefined,
      currency: currency ?? undefined,
      subtotal: asNumber(normalized.subtotal),
      taxAmount: asNumber(normalized.taxAmount),
      totalPayable: asNumber(normalized.totalPayable),
      description: typeof normalized.description === "string" ? normalized.description : undefined,
      issueDate: issueDate && /^\d{4}-\d{2}-\d{2}$/.test(issueDate) ? issueDate : undefined,
      projectReference: typeof normalized.projectReference === "string" ? normalized.projectReference.trim() || undefined : undefined,
    };
  } catch {
    return {};
  }
}

export function readFailure(text: string): { partial: PartialExtraction; reason: string; lineCheck?: string } {
  let raw: Record<string, unknown> | null = null;
  try {
    const value = JSON.parse(stripJson(text)) as unknown;
    if (value && typeof value === "object") raw = value as Record<string, unknown>;
  } catch {
    raw = null;
  }
  if (!raw) {
    return {
      partial: {},
      reason: "Faltan campos obligatorios: número de factura, proveedor, moneda, subtotal, impuestos, total a pagar, descripción, fecha de emisión.",
    };
  }
  const partial = partialExtraction(text);
  const gaps: string[] = [];
  if (!partial.invoiceNumber?.trim()) gaps.push(FIELD_LABELS.invoiceNumber);
  if (!partial.vendorName?.trim()) gaps.push(FIELD_LABELS.vendorName);
  if (!partial.currency) {
    const printed = typeof raw.currency === "string" ? raw.currency.trim() : "";
    gaps.push(printed ? `moneda (${printed} no es ISO 4217 ni BTC, ETH, USDT o USDC)` : FIELD_LABELS.currency);
  }
  if (partial.subtotal === undefined) gaps.push(FIELD_LABELS.subtotal);
  if (partial.taxAmount === undefined) gaps.push(FIELD_LABELS.taxAmount);
  if (partial.totalPayable === undefined || partial.totalPayable <= 0) gaps.push(FIELD_LABELS.totalPayable);
  if (!partial.description?.trim()) gaps.push(FIELD_LABELS.description);
  if (!partial.issueDate) {
    const printed = typeof raw.issueDate === "string" ? raw.issueDate.trim() : "";
    gaps.push(printed ? `fecha de emisión (${printed})` : FIELD_LABELS.issueDate);
  }
  if (gaps.length > 0) return { partial, reason: `Faltan campos obligatorios: ${gaps.join(", ")}.` };
  return {
    partial,
    reason: "El subtotal más los impuestos no igualan el total a pagar.",
    lineCheck: "El subtotal más los impuestos no igualan el total a pagar.",
  };
}

export function payableIsAuditable(partial: PartialExtraction): partial is PartialExtraction & {
  currency: Extraction["currency"];
  totalPayable: number;
  issueDate: string;
} {
  return (
    partial.currency !== undefined &&
    partial.issueDate !== undefined &&
    typeof partial.totalPayable === "number" &&
    partial.totalPayable > 0
  );
}

function promptFor(invoice: Invoice): { system: string; user: string } {
  const vendor = findVendor(invoice.vendorId);
  return {
    system: READ_SYSTEM,
    user: JSON.stringify({
      documentKind: invoice.documentKind,
      documentLabel: invoice.documentLabel,
      evidenceNote: invoice.evidenceNote,
      lineItems: invoice.lineItems,
      vendorOnFile: vendor?.legalName ?? invoice.vendorName,
      knownFields: extractionFromInvoice(invoice),
    }),
  };
}

export async function extractInvoice(invoice: Invoice, keys: ByokKeys): Promise<ExtractionRun> {
  const fallback = extractionFromInvoice(invoice);
  if (!keys.read?.apiKey) {
    return {
      invoice,
      extraction: fallback,
      mode: "fallback",
      escalated: false,
      raw: { reason: "Sin clave en la capa de lectura. Se conserva la extracción del snapshot." },
    };
  }

  try {
    const result = await completeWithRetry(keys.read, promptFor(invoice), (text) => parseExtraction(text) !== null);
    const parsed = parseExtraction(result.text);
    if (!parsed) {
      return {
        invoice,
        extraction: fallback,
        mode: "fallback",
        escalated: result.escalated,
        raw: { text: result.text },
        error: "La extracción no pasó Zod. Se conserva el snapshot.",
      };
    }
    return {
      invoice: applyExtraction(invoice, parsed),
      extraction: parsed,
      mode: "live",
      model: result.model,
      escalated: result.escalated,
      raw: parsed,
    };
  } catch (error) {
    return {
      invoice,
      extraction: fallback,
      mode: "fallback",
      escalated: false,
      raw: { reason: error instanceof Error ? error.message : "Fallo de extracción" },
      error: error instanceof Error ? error.message : "Fallo de extracción",
    };
  }
}

export function documentUserContent(input: {
  text?: string;
  bytes?: Uint8Array;
  mime?: string;
  filename?: string;
}): string | ChatPart[] {
  const parts: ChatPart[] = [];
  if (input.text?.trim()) parts.push({ type: "text", text: input.text.trim() });
  if (input.bytes && input.bytes.byteLength > 0) {
    const mime = input.mime || "application/octet-stream";
    const filename = input.filename || "factura";
    const svg = mime === "image/svg+xml" || filename.toLowerCase().endsWith(".svg");
    if (svg || mime.startsWith("text/")) {
      parts.push({ type: "text", text: new TextDecoder().decode(input.bytes) });
    } else if (mime === "application/pdf") {
      const fileData = `data:application/pdf;base64,${Buffer.from(input.bytes).toString("base64")}`;
      parts.push({ type: "file", file: { filename, file_data: fileData } });
    } else if (mime.startsWith("image/")) {
      parts.push({
        type: "image_url",
        image_url: { url: `data:${mime};base64,${Buffer.from(input.bytes).toString("base64")}` },
      });
    } else {
      throw new Error("El archivo tiene que ser PNG, JPEG, WebP, PDF o SVG.");
    }
  }
  if (parts.length === 0) throw new Error("El mensaje no trae texto ni archivo.");
  if (parts.length === 1 && parts[0].type === "text") return parts[0].text;
  return parts;
}

export async function extractDocument(
  input: { text?: string; bytes?: Uint8Array; mime?: string; filename?: string },
  keys: ByokKeys,
): Promise<DocumentRead> {
  if (!keys.read?.apiKey) {
    return {
      ok: false,
      partial: {},
      escalated: false,
      raw: { reason: "Sin clave en la capa de lectura." },
      reason: "Sin clave en la capa de lectura.",
    };
  }
  const user = documentUserContent(input);
  try {
    const result = await completeWithRetry(keys.read, { system: READ_SYSTEM, user }, (text) => parseExtraction(text) !== null);
    const parsed = parseExtraction(result.text);
    if (!parsed) {
      const failure = readFailure(result.text);
      return {
        ok: false,
        partial: failure.partial,
        model: result.model,
        escalated: result.escalated,
        raw: { text: result.text },
        reason: failure.reason,
        lineCheck: failure.lineCheck,
      };
    }
    return { ok: true, extraction: parsed, model: result.model, escalated: result.escalated, raw: parsed };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Fallo de lectura.";
    return {
      ok: false,
      partial: {},
      escalated: false,
      raw: { reason },
      reason,
    };
  }
}
