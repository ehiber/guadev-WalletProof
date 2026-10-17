import { attachmentFrom, ingestIncoming, publishVerdict } from "@/lib/engine/ingest";
import { clientIp, takeLiveSlot } from "@/lib/engine/live-budget";
import { INITIAL_DATASET } from "@/lib/mock-data/initial-dataset";
import { pushOpenClawEvent } from "@/lib/openclaw/constants";
import { arrivedInvoices, sessionRules } from "@/lib/session-inbox";
import { z } from "zod";

const bodySchema = z.object({
  from: z.string().min(1),
  subject: z.string().min(1),
  text: z.string().min(1),
  attachment: z
    .object({
      filename: z.string().optional(),
      mime: z.string().optional(),
      base64: z.string().min(1),
    })
    .optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "El correo necesita remitente, asunto y texto." }, { status: 400 });
  }
  const limited = takeLiveSlot(clientIp(request));
  if (limited) {
    return Response.json({ error: limited }, { status: 429 });
  }
  const message = [`De: ${parsed.data.from}`, `Asunto: ${parsed.data.subject}`, parsed.data.text].join("\n");
  const file = parsed.data.attachment
    ? attachmentFrom({ media: parsed.data.attachment.base64, mime: parsed.data.attachment.mime, filename: parsed.data.attachment.filename })
    : {};
  try {
    const outcome = await ingestIncoming({
      channel: "email",
      text: message,
      bytes: file.bytes,
      mime: file.mime,
      filename: file.filename,
      rules: sessionRules(),
      keys: {},
      existing: [...INITIAL_DATASET, ...arrivedInvoices()],
    });
    const event = publishVerdict("email", outcome);
    return Response.json({ event, ...outcome });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "No se pudo leer el correo.";
    const event = pushOpenClawEvent({ kind: "ingest", payload: { channel: "email", error: reason } });
    return Response.json({ error: reason, event }, { status: 400 });
  }
}
