import { evaluateBatch } from "../src/lib/engine/pipeline";
import { DEFAULT_RULES } from "../src/lib/mock-data/company-rules";
import { INITIAL_DATASET } from "../src/lib/mock-data/initial-dataset";

const EXPECTED = [
  ["INV-01", "APPROVED"],
  ["INV-02", "APPROVED"],
  ["INV-03", "ESCALATED"],
  ["INV-04", "ESCALATED"],
  ["INV-05", "BLOCKED"],
  ["INV-06", "ESCALATED"],
  ["INV-07", "BLOCKED"],
  ["INV-08", "BLOCKED"],
] as const;

const results = evaluateBatch(INITIAL_DATASET, DEFAULT_RULES);
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
}

if (failed) process.exit(1);
