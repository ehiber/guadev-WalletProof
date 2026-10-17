import { findVendor } from "@/lib/mock-data/company-rules";
import {
  applyExtraction,
  completeWithRetry,
  extractionFromInvoice,
  extractionSchema,
  geminiClient,
  stripJson,
  type ByokKeys,
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

function promptFor(invoice: Invoice): { system: string; user: string } {
  const vendor = findVendor(invoice.vendorId);
  return {
    system:
      "Extrae una factura sintética. Responde solo JSON con invoiceNumber, vendorName, currency, subtotal, taxAmount, totalPayable y description. currency es USD, COP, MXN, VES o ARS. Los números son el total a pagar, no un cálculo nuevo. No apruebes ni rechaces el pago.",
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
  if (!keys.gemini) {
    return {
      invoice,
      extraction: fallback,
      mode: "fallback",
      escalated: false,
      raw: { reason: "Sin GEMINI_API_KEY. Se conserva la extracción del snapshot." },
    };
  }

  const cheap = geminiClient(keys.gemini, "gemini-2.5-flash");
  const strong = geminiClient(keys.gemini, "gemini-2.5-pro");
  try {
    const result = await completeWithRetry(cheap, strong, promptFor(invoice), (text) => {
      const parsed = extractionSchema.safeParse(JSON.parse(stripJson(text)));
      return parsed.success;
    });
    const parsed = extractionSchema.safeParse(JSON.parse(stripJson(result.text)));
    if (!parsed.success) {
      return {
        invoice,
        extraction: fallback,
        mode: "fallback",
        escalated: result.escalated,
        raw: { text: result.text, issues: parsed.error.issues },
        error: "La extracción no pasó Zod. Se conserva el snapshot.",
      };
    }
    return {
      invoice: applyExtraction(invoice, parsed.data),
      extraction: parsed.data,
      mode: "live",
      model: result.model,
      escalated: result.escalated,
      raw: parsed.data,
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
