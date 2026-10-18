import { loadFxReference } from "@/lib/engine/fx-market";

export async function GET() {
  return Response.json(await loadFxReference());
}
