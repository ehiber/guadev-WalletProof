import type { DecisionStatus, IntakeChannel } from "@/types/blinka";

export function usd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function amount(value: number, currency: string): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

export function intakeLabel(invoice: { id: string; intakeChannel?: IntakeChannel }): string {
  if (invoice.intakeChannel === "email" || invoice.id.startsWith("MAIL-")) return "Correo";
  if (invoice.intakeChannel === "chat" || invoice.id.startsWith("CHAT-")) return "Chat";
  if (invoice.intakeChannel === "upload" || invoice.id.startsWith("PDF-")) return "Carga";
  return "Dataset";
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
  if (status === "APPROVED") return "bg-approved-bg text-approved";
  if (status === "ESCALATED") return "bg-warn-bg text-warn";
  return "bg-danger-bg text-danger";
}
