import { VENDORS } from "@/lib/mock-data/company-rules";
import type { AuditRecord, CostCenter, Invoice } from "@/types/blinka";

export const VENDOR_CATEGORIES = [
  "Cloud e infraestructura",
  "Diseño y marketing",
  "Desarrollo de software",
  "Mantenimiento",
  "Legal y administración",
  "Seguridad informática",
  "Por confirmar",
] as const;

export const VENDOR_STATUSES = ["authorized", "unregistered", "excluded"] as const;

export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export interface BankAccount {
  id: string;
  bank: string;
  holder: string;
  country: string;
  currency: string;
  identifier: string;
  type?: string;
}

export interface VendorNote {
  id: string;
  title: string;
  body: string;
  at: string;
  actor: string;
  invoiceId?: string;
}

export interface VendorAgreement {
  projectId: string;
  service: string;
  limitUsd: number;
  currencies: string[];
}

export interface VendorCard {
  id: string;
  name: string;
  legal: string;
  email: string;
  country: string;
  service: string;
  category: string;
  currencies: string[];
  status: VendorStatus;
  costCenter: CostCenter;
  bankAccounts: BankAccount[];
  notes: VendorNote[];
  agreements?: VendorAgreement[];
  taxId?: string;
  demoFilled: boolean;
}

const COUNTRY_NAME: Record<string, string> = {
  US: "Estados Unidos",
  CO: "Colombia",
  MX: "México",
};

const CATEGORY_BY_CENTER: Record<CostCenter, string> = {
  "Cloud & Infra": "Cloud e infraestructura",
  "Marketing & Growth": "Diseño y marketing",
  "Software Development": "Desarrollo de software",
  "Facilities & Maintenance": "Mantenimiento",
  "Legal & Admin": "Legal y administración",
  Other: "Por confirmar",
};

const CURRENCIES_BY_VENDOR: Record<string, string[]> = {
  "vendor-cloudnova": ["USD"],
  "vendor-pixelsur": ["COP", "USD"],
  "vendor-andessoft": ["USD", "MXN"],
  "vendor-carlos": ["USD"],
  "vendor-lexglobal": ["USD"],
  "vendor-nubemex": ["MXN", "USD"],
  "vendor-fiscalmx": ["MXN", "USD"],
  "vendor-rutanorte": ["MXN", "USD"],
};

const TRADE_NAME: Record<string, string> = {
  "vendor-cloudnova": "CloudNova Infrastructure",
  "vendor-pixelsur": "Estudio Pixel Sur",
  "vendor-andessoft": "AndesSoft Devs",
  "vendor-carlos": "Carlos Méndez",
  "vendor-lexglobal": "LexGlobal Advisory",
  "vendor-nubemex": "Nube MÃ©xico Servicios Digitales",
  "vendor-fiscalmx": "Fiscal MX Consultores",
  "vendor-rutanorte": "Ruta Norte LogÃ­stica",
};

export function vendorStatusLabel(status: VendorStatus): string {
  if (status === "authorized") return "Autorizado";
  if (status === "excluded") return "Excluido";
  return "Sin registrar";
}

export function vendorStatusClass(status: VendorStatus): string {
  if (status === "authorized") return "badge approved";
  if (status === "excluded") return "badge blocked";
  return "badge review";
}

export function maskAccount(identifier: string): string {
  const digits = identifier.replace(/\D/g, "");
  const tail = (digits || identifier).slice(-4);
  return `•••• ${tail || "0000"}`;
}

export interface VendorDraft {
  name: string;
  legal: string;
  email: string;
  country: string;
  service: string;
  category: string;
  currencies: string[];
  bank: string;
  holder: string;
  bankCountry: string;
  accountCurrency: string;
  identifier: string;
}

const CENTER_BY_CATEGORY: Record<string, CostCenter> = {
  "Cloud e infraestructura": "Cloud & Infra",
  "Diseño y marketing": "Marketing & Growth",
  "Desarrollo de software": "Software Development",
  Mantenimiento: "Facilities & Maintenance",
  "Legal y administración": "Legal & Admin",
  "Seguridad informática": "Other",
  "Por confirmar": "Other",
};

export function costCenterFor(category: string): CostCenter {
  return CENTER_BY_CATEGORY[category] ?? "Other";
}

export function cardFromDraft(draft: VendorDraft): VendorCard {
  const slug =
    draft.name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 18) || "proveedor";
  const now = new Date().toISOString();
  return {
    id: `vendor-${crypto.randomUUID().slice(0, 8)}`,
    name: draft.name.trim(),
    legal: draft.legal.trim() || draft.name.trim(),
    email: `${slug}@proveedor.example`,
    country: draft.country.trim(),
    service: draft.service.trim(),
    category: draft.category,
    currencies: draft.currencies,
    status: "unregistered",
    costCenter: CENTER_BY_CATEGORY[draft.category] ?? "Other",
    bankAccounts: [
      {
        id: `bank-${crypto.randomUUID()}`,
        bank: draft.bank.trim(),
        holder: draft.holder.trim() || draft.legal.trim(),
        country: draft.bankCountry.trim() || draft.country.trim(),
        currency: draft.accountCurrency,
        identifier: draft.identifier,
      },
    ],
    notes: [
      {
        id: `note-${crypto.randomUUID()}`,
        title: "Proveedor creado",
        body: "Ficha y cuenta ficticias generadas para la demo.",
        at: now,
        actor: "Equipo de finanzas",
      },
    ],
    demoFilled: false,
  };
}

export function seedVendorCards(): VendorCard[] {
  return VENDORS.map((vendor) => {
    const country = COUNTRY_NAME[vendor.country] ?? vendor.country;
    const currencies = CURRENCIES_BY_VENDOR[vendor.id] ?? ["USD"];
    const name = TRADE_NAME[vendor.id] ?? vendor.legalName;
    const bankAccounts: BankAccount[] =
      vendor.bankAccountLast4 === "0000"
        ? []
        : [
            {
              id: `bank-${vendor.id}`,
              bank: "Banco de ejemplo",
              holder: vendor.legalName,
              country,
              currency: currencies[0] ?? "USD",
              identifier: `SYN-${vendor.bankAccountLast4}`,
            },
          ];
    return {
      id: vendor.id,
      name,
      legal: vendor.legalName,
      email: `${vendor.id.replace("vendor-", "")}@proveedor.example`,
      country,
      service: vendor.contractSummary,
      category: CATEGORY_BY_CENTER[vendor.costCenter],
      currencies,
      status: vendor.active ? "authorized" : "unregistered",
      costCenter: vendor.costCenter,
      bankAccounts,
      notes: [],
      demoFilled: false,
    };
  });
}

export function approvalAccounts(
  vendorId: string,
  invoices: Invoice[],
  human: Record<string, { decision: string }>,
  records: AuditRecord[],
): Array<{ invoiceId: string; line: string }> {
  const found: Array<{ invoiceId: string; line: string }> = [];
  for (const invoice of invoices) {
    if (invoice.vendorId !== vendorId) continue;
    const note = human[invoice.id];
    const record = records.find((item) => item.invoiceId === invoice.id);
    if (note?.decision !== "APPROVED" || record?.jevResult?.socialEngineeringRisk.score !== "HIGH") continue;
    const line = invoice.lineItems.find((item) => /cuenta/i.test(item)) ?? `Cuenta solicitada · ${invoice.id}`;
    found.push({ invoiceId: invoice.id, line });
  }
  return found;
}
