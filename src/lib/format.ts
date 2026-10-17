import type { DecisionStatus } from "@/types/blinka";

export function usd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function amount(value: number, currency: string): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

export function statusLabel(status: DecisionStatus): string {
  if (status === "APPROVED") return "Pagada";
  if (status === "ESCALATED") return "Escalada";
  return "Bloqueada";
}

export function statusClass(status: DecisionStatus): string {
  if (status === "APPROVED") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (status === "ESCALATED") return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-rose-50 text-rose-800 ring-rose-200";
}
