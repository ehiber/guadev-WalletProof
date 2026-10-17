import type { DecisionStatus, IntakeChannel } from "@/types/blinka";

export function usd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function fxRate(value: number): string {
  const digits = value >= 100 ? 2 : value >= 1 ? 4 : 8;
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

export function amount(value: number, currency: string): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
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
  limit: "Supera el límite automático",
  lineCheck: "Las líneas no cierran",
  jev: "JEV no se consultó",
  anomalyMedium: "Anomalía media",
  anomalyHigh: "Cuenta distinta a la contratada",
  contract: "Fuera del contrato",
  semanticDuplicate: "Posible duplicado",
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
  const letters = name.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "").slice(0, 2).toUpperCase();
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
