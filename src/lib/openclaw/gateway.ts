const GATEWAY_PATH = "/hooks/agent";

type GatewayConfig = {
  origin: string;
  clientId: string;
  clientSecret: string;
  token: string;
};

function headerSafe(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || /[\r\n]/.test(trimmed)) return null;
  return trimmed;
}

function readGateway(): GatewayConfig | null {
  const clientId = headerSafe(process.env.CF_ACCESS_CLIENT_ID);
  const clientSecret = headerSafe(process.env.CF_ACCESS_CLIENT_SECRET);
  const token = headerSafe(process.env.OPENCLAW_GATEWAY_TOKEN);
  const rawUrl = headerSafe(process.env.OPENCLAW_GATEWAY_URL);
  if (!clientId || !clientSecret || !token || !rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return null;
  return { origin: url.origin, clientId, clientSecret, token };
}

export function escalationNotice(input: {
  invoiceId: string;
  status: string;
  totalPayableUsd: number;
  explanation: string;
}): string {
  const note = input.explanation.replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, 500);
  const amount = Number(input.totalPayableUsd.toFixed(2));
  return `Aviso de Blinka Guard. Factura ${input.invoiceId} quedó ${input.status}. Total USD ${amount}. ${note} No apruebes, no rechaces y no calcules. Confirma solo que el aviso quedó recibido.`;
}

export function openClawGatewayReady(): boolean {
  return readGateway() !== null;
}

export async function deliverEscalation(message: string): Promise<"sent" | "skipped" | "failed"> {
  const gateway = readGateway();
  if (!gateway) return "skipped";
  const target = new URL(GATEWAY_PATH, gateway.origin);
  if (target.origin !== gateway.origin || target.pathname !== GATEWAY_PATH) return "failed";
  try {
    const response = await fetch(target, {
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "content-type": "application/json",
        "CF-Access-Client-Id": gateway.clientId,
        "CF-Access-Client-Secret": gateway.clientSecret,
        authorization: `Bearer ${gateway.token}`,
      },
      body: JSON.stringify({
        name: "Blinka",
        message,
        deliver: false,
      }),
    });
    await response.body?.cancel().catch(() => undefined);
    if (response.status >= 200 && response.status < 300) return "sent";
    return "failed";
  } catch {
    return "failed";
  }
}
