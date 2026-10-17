import { readDocument } from "@/lib/inbound/documents";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const document = readDocument(id);
  if (!document) return new Response("No encontrado.", { status: 404 });
  return new Response(Buffer.from(document.bytes), {
    headers: {
      "content-type": document.mime,
      "content-disposition": "inline",
      "cache-control": "private, max-age=3600",
    },
  });
}
