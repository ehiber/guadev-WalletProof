import { parseRules } from "@/lib/engine/schemas";
import { clearHumanNotes, publishRules } from "@/lib/session-inbox";

export async function POST(request: Request) {
  const rules = parseRules(await request.json().catch(() => null));
  if (!rules) {
    return Response.json({ error: "Las reglas no son válidas." }, { status: 400 });
  }
  publishRules(rules);
  clearHumanNotes();
  return Response.json({ ok: true });
}
