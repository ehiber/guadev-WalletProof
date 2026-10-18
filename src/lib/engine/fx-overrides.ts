import { lookupFx, paymentDate } from "@/lib/mock-data/fx-ledger";
import type { FxRate, Invoice } from "@/types/blinka";

export type FxScope = "day" | "invoice" | "vendor";

export interface FxOverride {
  id: string;
  scope: FxScope;
  date: string;
  currency: string;
  rateToUsd: number;
  invoiceId?: string;
  vendorId?: string;
  sourceName?: string;
  note?: string;
}

export function fxScopeLabel(scope: FxScope): string {
  if (scope === "invoice") return "Solo esta factura";
  if (scope === "vendor") return "Este proveedor ese día";
  return "Global de ese día";
}

function sameDay(left: string, right: string): boolean {
  return left.slice(0, 10) === right.slice(0, 10);
}

export function resolveFx(
  invoice: Invoice,
  overrides: FxOverride[],
  asOf = paymentDate(),
  market?: FxRate[],
  settled?: FxRate | null,
): FxRate | null {
  if (settled && settled.currency === invoice.currency && settled.rateToUsd > 0) return settled;
  const currency = invoice.currency;
  const invoiceRate = overrides.find((item) => item.scope === "invoice" && item.invoiceId === invoice.id && item.currency === currency);
  const vendorRate = overrides.find(
    (item) => item.scope === "vendor" && item.vendorId === invoice.vendorId && item.currency === currency && sameDay(item.date, asOf),
  );
  const dayRate = overrides.find((item) => item.scope === "day" && item.currency === currency && sameDay(item.date, asOf));
  const chosen = invoiceRate ?? vendorRate ?? dayRate;
  if (chosen) {
    return {
      date: asOf,
      currency,
      rateToUsd: chosen.rateToUsd,
      source: "Tasa modificada",
    };
  }
  if (currency === "USD") return { date: asOf, currency: "USD", rateToUsd: 1, source: "USD identity" };
  if (market) {
    const quoted = market.find((item) => item.currency === currency && item.rateToUsd > 0);
    return quoted ? { ...quoted, date: asOf, currency } : null;
  }
  return lookupFx(asOf, currency);
}

export function isModifiedRate(source: string | undefined): boolean {
  return source === "Tasa modificada";
}
