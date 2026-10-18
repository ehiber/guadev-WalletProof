import { evaluateBatch } from "../src/lib/engine/pipeline";
import { DEFAULT_RULES, VENDORS } from "../src/lib/mock-data/company-rules";
import { DEMO_ISSUE_DATE } from "../src/lib/mock-data/fx-ledger";
import { INITIAL_DATASET } from "../src/lib/mock-data/initial-dataset";
import { INITIAL_PROJECTS } from "../src/lib/mock-data/projects";

const EXPECTED = [
  ["INV-01", "APPROVED"],
  ["INV-02", "APPROVED"],
  ["INV-03", "ESCALATED"],
  ["INV-04", "ESCALATED"],
  ["INV-05", "BLOCKED"],
  ["INV-06", "ESCALATED"],
  ["INV-07", "BLOCKED"],
  ["INV-08", "BLOCKED"],
  ["INV-09", "APPROVED"],
  ["INV-10", "APPROVED"],
  ["INV-11", "ESCALATED"],
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
if (counts.APPROVED !== 8 || counts.ESCALATED !== 4 || counts.BLOCKED !== 3) {
  console.error(`Status mismatch: ${JSON.stringify(counts)}`);
  failed = true;
}

if (failed) process.exit(1);
