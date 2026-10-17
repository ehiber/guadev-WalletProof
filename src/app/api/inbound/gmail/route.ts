import { clientIp } from "@/lib/engine/live-budget";
import { gmailStatus, pollGmail } from "@/lib/inbound/gmail";

export async function GET() {
  return Response.json(gmailStatus());
}

export async function POST(request: Request) {
  return Response.json(await pollGmail(clientIp(request)));
}
