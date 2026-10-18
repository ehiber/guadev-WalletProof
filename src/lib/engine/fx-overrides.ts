import { lookupFx } from "@/lib/mock-data/fx-ledger";
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
}

export function fxScopeLabel(scope: FxScope): string {
  if (scope === "invoice") return "Solo esta factura";
  if (scope === "vendor") return "Este proveedor ese día";
  return "Global de ese día";
}

function sameDay(left: string, right: string): boolean {
  return left.slice(0, 10) === right.slice(0, 10);
}

export function resolveFx(invoice: Invoice, overrides: FxOverride[]): FxRate | null {
  const currency = invoice.currency;
  const invoiceRate = overrides.find((item) => item.scope === "invoice" && item.invoiceId === invoice.id && item.currency === currency);
  const vendorRate = overrides.find(
    (item) => item.scope === "vendor" && item.vendorId === invoice.vendorId && item.currency === currency && sameDay(item.date, invoice.issueDate),
  );
  const dayRate = overrides.find((item) => item.scope === "day" && item.currency === currency && sameDay(item.date, invoice.issueDate));
  const chosen = invoiceRate ?? vendorRate ?? dayRate;
  if (!chosen) return lookupFx(invoice.issueDate.slice(0, 10), currency);
  return {
    date: chosen.date.slice(0, 10),
    currency,
    rateToUsd: chosen.rateToUsd,
    source: "Tasa modificada",
  };
}

export function isModifiedRate(source: string | undefined): boolean {
  return source === "Tasa modificada";
}
