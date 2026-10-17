import { CRYPTO_CODES, FIAT_CODES, type FxQuote, type FxReference } from "@/lib/mock-data/fx-ledger";

const FIAT_URL = "https://open.er-api.com/v6/latest/USD";
const CRYPTO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether,usd-coin&vs_currencies=usd";

const CRYPTO_IDS: Record<string, (typeof CRYPTO_CODES)[number]> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  tether: "USDT",
  "usd-coin": "USDC",
};

export async function GET() {
  const errors: string[] = [];
  const [fiat, crypto] = await Promise.all([readFiat(errors), readCrypto(errors)]);
  return Response.json({
    asOf: new Date().toISOString().slice(0, 10),
    fiat,
    crypto,
    errors,
  } satisfies FxReference);
}

async function readFiat(errors: string[]): Promise<FxQuote[]> {
  try {
    const body = (await readJson(FIAT_URL)) as { rates?: Record<string, number> };
    return FIAT_CODES.flatMap((currency) => {
      const value = body.rates?.[currency];
      return typeof value === "number" && value > 0
        ? [{ currency, unitsPerUsd: value, source: "ExchangeRate-API · open.er-api.com" }]
        : [];
    });
  } catch {
    errors.push("No se pudo consultar la referencia fiat del día.");
    return [];
  }
}

async function readCrypto(errors: string[]): Promise<FxQuote[]> {
  try {
    const body = (await readJson(CRYPTO_URL)) as Record<string, { usd?: number }>;
    return Object.entries(CRYPTO_IDS).flatMap(([id, currency]) => {
      const usd = body[id]?.usd;
      return typeof usd === "number" && usd > 0
        ? [{ currency, unitsPerUsd: 1 / usd, source: "CoinGecko · simple/price" }]
        : [];
    });
  } catch {
    errors.push("No se pudo consultar la referencia de criptomonedas del día.");
    return [];
  }
}

async function readJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}
