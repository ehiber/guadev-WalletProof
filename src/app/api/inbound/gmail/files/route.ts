import { messageFiles } from "@/lib/inbound/gmail";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("message")?.trim() ?? "";
  if (!id) return Response.json({ files: [] }, { status: 400 });
  const files = await messageFiles(id);
  const index = url.searchParams.get("index");
  if (index == null) {
    return Response.json({
      files: files.map((file, position) => ({
        name: file.filename,
        mime: file.mime,
        href: `/api/inbound/gmail/files?message=${encodeURIComponent(id)}&index=${position}`,
      })),
    });
  }
  const file = files[Number(index)];
  if (!file) return new Response("No encontrado", { status: 404 });
  const name = file.filename.replace(/["\r\n]/g, "");
  return new Response(Buffer.from(file.bytes), {
    headers: {
      "content-type": file.mime,
      "content-disposition": `inline; filename="${name}"`,
      "cache-control": "private, max-age=300",
    },
  });
}
