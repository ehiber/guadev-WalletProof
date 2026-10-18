import { ingestChatPayload } from "@/lib/openclaw/chat-ingest";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { payload?: unknown } | null;
  if (!body || !("payload" in body)) {
    return Response.json({ error: "La solicitud no contiene una factura." }, { status: 400 });
  }
  return ingestChatPayload(request, body.payload);
}
