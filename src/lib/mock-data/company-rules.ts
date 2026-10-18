import { DEFAULT_CRITERIA } from "@/lib/engine/criteria";
import type { CompanyRules, Vendor } from "@/types/blinka";

export const DEFAULT_RULES: CompanyRules = {
  maxAutoApproveUsd: 500,
  monthlyBudgetUsd: 2500,
  jevConfidenceThreshold: 0.85,
  semanticDuplicateMinProbability: 0.8,
  criteria: DEFAULT_CRITERIA.map((item) => ({ ...item })),
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
  {
    id: "vendor-nubemex",
    legalName: "Nube México Servicios Digitales S.A. de C.V.",
    country: "MX",
    active: true,
    contractSummary: "Alojamiento cloud regional, respaldo y monitoreo para la expansión de México.",
    costCenter: "Cloud & Infra",
    bankAccountLast4: "4108",
  },
  {
    id: "vendor-fiscalmx",
    legalName: "Fiscal MX Consultores S.C.",
    country: "MX",
    active: true,
    contractSummary: "Contabilidad operativa, facturación local y acompañamiento fiscal en México.",
    costCenter: "Legal & Admin",
    bankAccountLast4: "5264",
  },
  {
    id: "vendor-rutanorte",
    legalName: "Ruta Norte Logística S.A. de C.V.",
    country: "MX",
    active: true,
    contractSummary: "Mensajería, entrega de equipos y logística de apertura en ciudades de México.",
    costCenter: "Facilities & Maintenance",
    bankAccountLast4: "6830",
  },
];

export function findVendor(vendorId: string): Vendor | undefined {
  return VENDORS.find((vendor) => vendor.id === vendorId);
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchVendor(name: string): Vendor | undefined {
  const target = normalizeName(name);
  if (!target) return undefined;
  const ranked = VENDORS.map((vendor) => {
    const legal = normalizeName(vendor.legalName);
    if (legal === target) return { vendor, score: 3 };
    if (target.includes(legal) || legal.includes(target)) return { vendor, score: 2 };
    const token = legal.split(" ").find((part) => part.length >= 5);
    if (token && target.includes(token)) return { vendor, score: 1 };
    return { vendor, score: 0 };
  })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
  return ranked[0]?.vendor;
}
