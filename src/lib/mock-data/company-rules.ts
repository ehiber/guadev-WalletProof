import type { CompanyRules, Vendor } from "@/types/blinka";

export const DEFAULT_RULES: CompanyRules = {
  maxAutoApproveUsd: 500,
  monthlyBudgetUsd: 2500,
  jevConfidenceThreshold: 0.85,
  semanticDuplicateMinProbability: 0.8,
};

export const VENDORS: Vendor[] = [
  {
    id: "vendor-cloudnova",
    legalName: "CloudNova Infrastructure LLC",
    country: "US",
    active: true,
    contractSummary: "Hospedaje cloud, cómputo y almacenamiento para NovaLatam Holdings LLC.",
    costCenter: "Cloud & Infra",
    bankAccountLast4: "4412",
  },
  {
    id: "vendor-pixelsur",
    legalName: "Estudio Pixel Sur S.A.S.",
    country: "CO",
    active: true,
    contractSummary: "Diseño de interfaz, investigación UX y piezas gráficas. No incluye operación de servidores.",
    costCenter: "Marketing & Growth",
    bankAccountLast4: "2201",
  },
  {
    id: "vendor-andessoft",
    legalName: "AndesSoft Devs LLC",
    country: "MX",
    active: true,
    contractSummary: "Desarrollo de software a medida y mantenimiento de la plataforma interna.",
    costCenter: "Software Development",
    bankAccountLast4: "7788",
  },
  {
    id: "vendor-carlos",
    legalName: "Carlos Méndez — Refrigeración y Eléctricos",
    country: "CO",
    active: false,
    contractSummary: "Sin contrato vigente. Beneficiario no autorizado en la whitelist.",
    costCenter: "Facilities & Maintenance",
    bankAccountLast4: "0000",
  },
  {
    id: "vendor-lexglobal",
    legalName: "LexGlobal Advisory Partners",
    country: "US",
    active: true,
    contractSummary: "Asesoría legal corporativa y revisión de contratos con proveedores de LatAm.",
    costCenter: "Legal & Admin",
    bankAccountLast4: "9001",
  },
];

export function findVendor(vendorId: string): Vendor | undefined {
  return VENDORS.find((vendor) => vendor.id === vendorId);
}
