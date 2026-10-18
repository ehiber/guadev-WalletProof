import { MAX_DOCUMENT_BYTES } from "@/lib/engine/ingest";
import { textLooksLikePayable } from "@/lib/inbound/gmail";

export const INVOICE_ONLY_REPLY =
  "Este chat solo recibe facturas. Envía el texto del cobro o adjunta el PDF o la foto.";

const FILE_MIME: Record<string, string> = {
  "application/pdf": "application/pdf",
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/webp": "image/webp",
};

function fileMime(mime: string | undefined, filename: string | undefined): string | null {
  const normalized = mime?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (FILE_MIME[normalized]) return FILE_MIME[normalized];
  const name = filename?.toLowerCase() ?? "";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  return null;
}

export function chatCanReceiveInvoice(input: {
  text?: string;
  byteLength?: number;
  mime?: string;
  filename?: string;
}): { ok: true; mime?: string } | { ok: false } {
  const size = input.byteLength ?? 0;
  if (size > MAX_DOCUMENT_BYTES) return { ok: false };
  if (size > 0) {
    const mime = fileMime(input.mime, input.filename);
    if (!mime) return { ok: false };
    return { ok: true, mime };
  }
  if (textLooksLikePayable(input.text ?? "")) return { ok: true };
  return { ok: false };
}
