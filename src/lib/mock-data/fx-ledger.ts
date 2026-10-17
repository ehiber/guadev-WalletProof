import type { FxRate } from "@/types/blinka";

export const DEMO_ISSUE_DATE = "2026-10-16";

const SOURCE = "Libro sintético Blinka Guard — tasa fija de demo";
const CRYPTO_SOURCE = "Libro sintético Blinka Guard — cripto de demo";

export const FIAT_CODES = ["EUR", "BRL", "ARS", "PEN", "CRC", "COP", "MXN", "CLP", "BOB", "ZAR", "VES"] as const;
export const CRYPTO_CODES = ["BTC", "ETH", "USDT", "USDC"] as const;
export const USDC_NETWORKS = ["Base", "Ethereum", "Polygon", "Celo", "Solana"] as const;

export const FX_LEDGER: Record<string, Partial<Record<string, FxRate>>> = {
  [DEMO_ISSUE_DATE]: {
    USD: { date: DEMO_ISSUE_DATE, currency: "USD", rateToUsd: 1, source: "USD identity" },
    EUR: { date: DEMO_ISSUE_DATE, currency: "EUR", rateToUsd: 0.92, source: SOURCE },
    BRL: { date: DEMO_ISSUE_DATE, currency: "BRL", rateToUsd: 5.4, source: SOURCE },
    ARS: { date: DEMO_ISSUE_DATE, currency: "ARS", rateToUsd: 1050, source: SOURCE },
    PEN: { date: DEMO_ISSUE_DATE, currency: "PEN", rateToUsd: 3.75, source: SOURCE },
    CRC: { date: DEMO_ISSUE_DATE, currency: "CRC", rateToUsd: 510, source: SOURCE },
    COP: { date: DEMO_ISSUE_DATE, currency: "COP", rateToUsd: 4200, source: SOURCE },
    MXN: { date: DEMO_ISSUE_DATE, currency: "MXN", rateToUsd: 18.25, source: SOURCE },
    CLP: { date: DEMO_ISSUE_DATE, currency: "CLP", rateToUsd: 950, source: SOURCE },
    BOB: { date: DEMO_ISSUE_DATE, currency: "BOB", rateToUsd: 6.9, source: SOURCE },
    ZAR: { date: DEMO_ISSUE_DATE, currency: "ZAR", rateToUsd: 18.5, source: SOURCE },
    VES: { date: DEMO_ISSUE_DATE, currency: "VES", rateToUsd: 36.5, source: SOURCE },
    BTC: { date: DEMO_ISSUE_DATE, currency: "BTC", rateToUsd: 0.00002, source: CRYPTO_SOURCE },
    ETH: { date: DEMO_ISSUE_DATE, currency: "ETH", rateToUsd: 0.0004, source: CRYPTO_SOURCE },
    USDT: { date: DEMO_ISSUE_DATE, currency: "USDT", rateToUsd: 1, source: CRYPTO_SOURCE },
    USDC: { date: DEMO_ISSUE_DATE, currency: "USDC", rateToUsd: 1, source: CRYPTO_SOURCE },
  },
};

export function lookupFx(issueDate: string, currency: string): FxRate | null {
  return FX_LEDGER[issueDate]?.[currency] ?? null;
}

export function fxTickerRates(): FxRate[] {
  const day = FX_LEDGER[DEMO_ISSUE_DATE];
  return [...FIAT_CODES, ...CRYPTO_CODES].map((code) => day[code]).filter((rate): rate is FxRate => Boolean(rate));
}

export interface FxQuote {
  currency: string;
  unitsPerUsd: number;
  source: string;
}

export interface FxReference {
  asOf: string;
  fiat: FxQuote[];
  crypto: FxQuote[];
  errors: string[];
}
