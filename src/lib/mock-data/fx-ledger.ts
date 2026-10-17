import type { FxRate } from "@/types/blinka";

export const DEMO_ISSUE_DATE = "2026-10-16";

const SOURCE = "Libro sintético Blinka Guard — tasa fija de demo";

export const FX_LEDGER: Record<string, Partial<Record<string, FxRate>>> = {
  [DEMO_ISSUE_DATE]: {
    USD: { date: DEMO_ISSUE_DATE, currency: "USD", rateToUsd: 1, source: "USD identity" },
    COP: { date: DEMO_ISSUE_DATE, currency: "COP", rateToUsd: 4200, source: SOURCE },
    MXN: { date: DEMO_ISSUE_DATE, currency: "MXN", rateToUsd: 18.25, source: SOURCE },
    VES: { date: DEMO_ISSUE_DATE, currency: "VES", rateToUsd: 36.5, source: SOURCE },
    ARS: { date: DEMO_ISSUE_DATE, currency: "ARS", rateToUsd: 1050, source: SOURCE },
  },
};

export function lookupFx(issueDate: string, currency: string): FxRate | null {
  return FX_LEDGER[issueDate]?.[currency] ?? null;
}

export function fxTickerRates(): FxRate[] {
  const day = FX_LEDGER[DEMO_ISSUE_DATE];
  return [day.COP, day.MXN, day.VES, day.ARS].filter((rate): rate is FxRate => Boolean(rate));
}
