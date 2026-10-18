import { evaluateBatch } from "../src/lib/engine/pipeline";
import { DEFAULT_RULES, VENDORS } from "../src/lib/mock-data/company-rules";
import { DEMO_ISSUE_DATE } from "../src/lib/mock-data/fx-ledger";
import { INITIAL_DATASET } from "../src/lib/mock-data/initial-dataset";
import { INITIAL_PROJECTS } from "../src/lib/mock-data/projects";
import { matchProject } from "../src/lib/engine/project-matcher";
import {
  compareBankAccount,
  defaultBankAccount,
  isLikelyPaymentAccountIdentifier,
  normalizeAccountIdentifier,
} from "../src/lib/engine/bank-account";
import { extractionSchema } from "../src/lib/engine/model-provider";
import { seedVendorCards } from "../src/lib/vendors/directory";

const EXPECTED = [
  ["INV-01", "APPROVED"],
  ["INV-02", "APPROVED"],
  ["INV-03", "ESCALATED"],
  ["INV-04", "ESCALATED"],
  ["INV-05", "BLOCKED"],
  ["INV-06", "ESCALATED"],
  ["INV-07", "ESCALATED"],
  ["INV-08", "ESCALATED"],
  ["INV-09", "APPROVED"],
  ["INV-10", "APPROVED"],
  ["INV-11", "APPROVED"],
  ["INV-12", "APPROVED"],
  ["INV-13", "APPROVED"],
  ["INV-14", "APPROVED"],
  ["INV-15", "APPROVED"],
] as const;

const results = evaluateBatch(INITIAL_DATASET, DEFAULT_RULES, [], DEMO_ISSUE_DATE, undefined, undefined, INITIAL_PROJECTS);
const byId = new Map(results.map((record) => [record.invoiceId, record]));
const inv02 = byId.get("INV-02");
const inv03 = byId.get("INV-03");

if (inv02?.totalPayableUsd !== 400 || inv03?.totalPayableUsd !== 533.6) {
  console.error(
    `USD mismatch INV-02=${inv02?.totalPayableUsd} INV-03=${inv03?.totalPayableUsd}`,
  );
  process.exit(1);
}

if (inv03.hardRulesResult.isWithinSingleLimit) {
  console.error("INV-03 used a limit check that ignored tax.");
  process.exit(1);
}

let failed = false;

const rutaNorteAccounts = seedVendorCards()
  .find((vendor) => vendor.id === "vendor-rutanorte")
  ?.bankAccounts.map((account) => account.identifier);
if (!rutaNorteAccounts?.includes("390015227") || !rutaNorteAccounts.includes("551208764390015227")) {
  console.error("Ruta Norte payment account and CLABE are not registered.");
  failed = true;
}

if (
  DEFAULT_RULES.criteria.find((criterion) => criterion.id === "budget")?.action !== "ESCALATED" ||
  DEFAULT_RULES.criteria.find((criterion) => criterion.id === "lineCheck")?.action !== "BLOCKED"
) {
  console.error("Default consequences for budget or arithmetic checks are incorrect.");
  failed = true;
}

const differentAccount = compareBankAccount("TEST-NUEVA-9999", ["SYN-4412"]);
const sameAccount = compareBankAccount(" syn 4412 ", ["SYN-4412"]);
const defaultAccount = defaultBankAccount(["SYN-4412"]);
if (
  differentAccount.matches ||
  !sameAccount.matches ||
  !defaultAccount?.matches ||
  !defaultAccount.usedDefault ||
  normalizeAccountIdentifier("SYN-44 12") !== "SYN4412" ||
  isLikelyPaymentAccountIdentifier("WP-T26-018") ||
  !isLikelyPaymentAccountIdentifier("TEST-NUEVA-9999")
) {
  console.error("Deterministic bank account comparison failed.");
  failed = true;
}
const extractedAccount = extractionSchema.safeParse({
  invoiceNumber: "WP-T26-018",
  vendorName: "CloudNova Infrastructure LLC",
  currency: "USD",
  subtotal: 100,
  taxAmount: 0,
  totalPayable: 100,
  description: "Hospedaje cloud, cómputo y almacenamiento.",
  issueDate: "2026-10-18",
  projectReference: "AND-26",
  paymentAccountIdentifier: "TEST-NUEVA-9999",
});
if (!extractedAccount.success || extractedAccount.data.paymentAccountIdentifier !== "TEST-NUEVA-9999") {
  console.error("Payment account extraction schema failed.");
  failed = true;
}

const bankMismatch = evaluateBatch(
  [{ ...INITIAL_DATASET[0], id: "BANK-MISMATCH", invoiceNumber: "BANK-MISMATCH", bankAccountCheck: differentAccount }],
  DEFAULT_RULES,
  [],
  DEMO_ISSUE_DATE,
  undefined,
  undefined,
  INITIAL_PROJECTS,
)[0];
if (bankMismatch.finalStatus !== "ESCALATED" || bankMismatch.hardRulesResult.bankAccountMatches !== false) {
  console.error(`Bank account mismatch was not escalated: ${bankMismatch.finalStatus}`);
  failed = true;
}

const reviewRules = {
  ...DEFAULT_RULES,
  criteria: DEFAULT_RULES.criteria.map((criterion) =>
    criterion.id === "anomalyHigh" ? { ...criterion, action: "ESCALATED" as const } : criterion,
  ),
};
const bankReview = evaluateBatch(
  [{ ...INITIAL_DATASET[0], id: "BANK-REVIEW", invoiceNumber: "BANK-REVIEW", bankAccountCheck: differentAccount }],
  reviewRules,
  [],
  DEMO_ISSUE_DATE,
  undefined,
  undefined,
  INITIAL_PROJECTS,
)[0];
if (bankReview.finalStatus !== "ESCALATED") {
  console.error(`Configured bank account review did not escalate: ${bankReview.finalStatus}`);
  failed = true;
}

const rulesWithBlockedProject = {
  ...DEFAULT_RULES,
  criteria: DEFAULT_RULES.criteria.map((criterion) =>
    criterion.id === "project" ? { ...criterion, action: "BLOCKED" as const } : criterion,
  ),
};
const invoiceWithoutProject = evaluateBatch(
  [
    {
      ...INITIAL_DATASET[0],
      id: "NO-PROJECT",
      invoiceNumber: "NO-PROJECT",
      projectId: undefined,
      projectReference: undefined,
      projectAssignment: undefined,
    },
  ],
  rulesWithBlockedProject,
  [],
  DEMO_ISSUE_DATE,
  undefined,
  undefined,
  INITIAL_PROJECTS,
)[0];
if (invoiceWithoutProject.finalStatus !== "ESCALATED" || invoiceWithoutProject.hardRulesResult.hasProject) {
  console.error(`Invoice without project did not escalate: ${invoiceWithoutProject.finalStatus}`);
  failed = true;
}

const baseInvoice = INITIAL_DATASET[0];
const explicitProject = matchProject(
  { ...baseInvoice, projectId: undefined, description: "Servicio para Lanzamiento Andino", projectAssignment: undefined },
  INITIAL_PROJECTS,
);
const uniqueProject = matchProject(
  {
    ...baseInvoice,
    projectId: undefined,
    projectAssignment: undefined,
    vendorId: "vendor-nubemex",
    currency: "MXN",
    periodKey: "2026-10",
    description: "Servicio mensual",
    lineItems: ["Servicio mensual"],
    evidenceNote: "Factura recibida",
  },
  INITIAL_PROJECTS,
);
const ambiguousProject = matchProject(
  {
    ...baseInvoice,
    projectId: undefined,
    projectAssignment: undefined,
    currency: "USD",
    description: "Servicio mensual",
    lineItems: ["Servicio mensual"],
    evidenceNote: "Factura recibida",
  },
  INITIAL_PROJECTS,
);

if (explicitProject?.projectId !== "prj-andino" || explicitProject.method !== "explicit-reference") {
  console.error("Explicit project matching failed.");
  failed = true;
}
if (uniqueProject?.projectId !== "prj-expansion-mexico" || uniqueProject.method !== "unique-eligibility") {
  console.error("Unique eligibility project matching failed.");
  failed = true;
}
if (ambiguousProject !== null) {
  console.error("Ambiguous project matching must remain unassigned.");
  failed = true;
}

if (INITIAL_DATASET.length !== 15 || INITIAL_PROJECTS.length !== 3 || VENDORS.length !== 8) {
  console.error(`Dataset mismatch: invoices=${INITIAL_DATASET.length}, projects=${INITIAL_PROJECTS.length}, vendors=${VENDORS.length}`);
  failed = true;
}

for (const [id, status] of EXPECTED) {
  const actual = byId.get(id)?.finalStatus ?? "MISSING";
  console.log(`${id}: ${actual}`);
  if (actual !== status) failed = true;
}

for (const record of results) {
  if (!/^[a-f0-9]{64}$/.test(record.auditHash)) {
    console.error(`${record.invoiceId} audit hash is not SHA-256 hex`);
    failed = true;
  }
  if (record.finalStatus === "APPROVED" && !record.hardRulesResult.passed) {
    console.error(`${record.invoiceId} was approved despite a failed hard rule`);
    failed = true;
  }
}

const counts = results.reduce(
  (total, record) => ({ ...total, [record.finalStatus]: total[record.finalStatus] + 1 }),
  { APPROVED: 0, ESCALATED: 0, BLOCKED: 0 },
);
if (counts.APPROVED !== 9 || counts.ESCALATED !== 5 || counts.BLOCKED !== 1) {
  console.error(`Status mismatch: ${JSON.stringify(counts)}`);
  failed = true;
}

if (failed) process.exit(1);
