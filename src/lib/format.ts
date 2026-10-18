import { isCryptoCurrency } from "@/lib/engine/currency";
import type { DecisionStatus, IntakeChannel } from "@/types/blinka";

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function budgetMonthLabel(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  const name = MONTHS_ES[month - 1];
  return name ? `${name} de ${year}` : null;
}

export function budgetMonthOptions(startYear = 2026, count = 18) {
  return Array.from({ length: count }, (_, index) => {
    const month = (index % 12) + 1;
    const year = startYear + Math.floor(index / 12);
    const value = `${year}-${String(month).padStart(2, "0")}`;
    return { value, label: `${MONTHS_ES[month - 1]} de ${year}` };
  });
}

export function usd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function fxRate(value: number): string {
  const digits = value >= 100 ? 2 : value >= 1 ? 4 : 8;
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

export function amount(value: number, currency: string): string {
  const digits = isCryptoCurrency(currency) && currency !== "USDT" && currency !== "USDC" ? 8 : 2;
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits === 2 ? 2 : 0,
    maximumFractionDigits: digits,
  }).format(value)} ${currency}`;
}

export function payableLines(
  totalPayable: number,
  currency: string,
  totalPayableUsd: number,
  fxValid: boolean,
): { primary: string; secondary?: string } {
  if (!fxValid) {
    return totalPayable > 0
      ? { primary: amount(totalPayable, currency), secondary: "Sin tasa del día" }
      : { primary: amount(totalPayable, currency) };
  }
  if (currency === "USD") return { primary: usd(totalPayableUsd) };
  return { primary: usd(totalPayableUsd), secondary: amount(totalPayable, currency) };
}

const DEMO_ORIGIN: Record<string, string> = {
  "INV-01": "Correo",
  "INV-02": "Correo",
  "INV-03": "Integración",
  "INV-04": "Carga manual",
  "INV-05": "Correo",
  "INV-06": "Correo",
  "INV-07": "Chat",
  "INV-08": "Integración",
};

export function intakeLabel(invoice: { id: string; intakeChannel?: IntakeChannel }): string {
  if (invoice.intakeChannel === "email" || invoice.id.startsWith("MAIL-")) return "Correo";
  if (invoice.intakeChannel === "chat" || invoice.id.startsWith("CHAT-")) return "Chat";
  if (invoice.intakeChannel === "upload" || invoice.id.startsWith("PDF-")) return "Carga manual";
  return "Dataset";
}

export function originLabel(invoice: { id: string; intakeChannel?: IntakeChannel }): string {
  return DEMO_ORIGIN[invoice.id] ?? intakeLabel(invoice);
}

const SHORT_VENDOR: Record<string, string> = {
  "vendor-cloudnova": "CloudNova Infrastructure",
  "vendor-pixelsur": "Estudio Pixel Sur",
  "vendor-andessoft": "AndesSoft Devs",
  "vendor-carlos": "Carlos Méndez",
  "vendor-lexglobal": "LexGlobal Advisory",
};

export function vendorDisplay(vendorId: string, legalName: string): string {
  return SHORT_VENDOR[vendorId] ?? legalName;
}

const SHORT_REASON: Record<string, string> = {
  extraction: "Faltan campos obligatorios",
  fx: "Sin tasa para la moneda",
  duplicate: "Cobro duplicado",
  budget: "No cabe en el presupuesto",
  whitelist: "Proveedor nuevo",
  project: "Sin proyecto",
  projectVendor: "Proveedor fuera del proyecto",
  limit: "Supera el límite automático",
  lineCheck: "Las líneas no cierran",
  jev: "JEV no se consultó",
  anomalyMedium: "Anomalía media",
  anomalyHigh: "Cuenta distinta a la contratada",
  contract: "Fuera del contrato",
  semanticDuplicate: "Posible cobro repetido",
};

export function shortReason(failedId: string | undefined, status: DecisionStatus): string {
  if (!failedId) return status === "APPROVED" ? "Dentro de las reglas" : statusLabel(status);
  return SHORT_REASON[failedId] ?? "Requiere criterio";
}

const VENDOR_INITIALS: Record<string, string> = {
  "vendor-cloudnova": "CN",
  "vendor-pixelsur": "PS",
  "vendor-andessoft": "AD",
  "vendor-carlos": "CM",
  "vendor-lexglobal": "LA",
};

export function vendorInitials(vendorId: string, name: string): string {
  if (VENDOR_INITIALS[vendorId]) return VENDOR_INITIALS[vendorId];
  const words = name.split(/\s+/).filter((part) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(part));
  const letters = words
    .slice(0, 2)
    .map((part) => part.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "")[0] ?? "")
    .join("")
    .toUpperCase();
  return letters || "NV";
}

export function statusLabel(status: DecisionStatus): string {
  if (status === "APPROVED") return "Pagado";
  if (status === "ESCALATED") return "Por revisar";
  return "Rechazado";
}

export function statusClass(status: DecisionStatus): string {
  if (status === "APPROVED") return "badge approved";
  if (status === "ESCALATED") return "badge review";
  return "badge blocked";
}
