import { mkdirSync, writeFileSync } from "node:fs";
import { renderInvoiceSvg } from "../src/lib/demo-document";
import { INITIAL_DATASET } from "../src/lib/mock-data/initial-dataset";

mkdirSync("public/demo-invoices", { recursive: true });

for (const invoice of INITIAL_DATASET) {
  writeFileSync(`public/demo-invoices/${invoice.id}.svg`, renderInvoiceSvg(invoice), "utf8");
}

console.log(`wrote ${INITIAL_DATASET.length} synthetic invoices`);
