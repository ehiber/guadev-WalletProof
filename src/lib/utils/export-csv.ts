import type { AuditRecord, Invoice } from "@/types/blinka";

function cell(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function recordsToCsv(invoices: Invoice[], records: AuditRecord[]): string {
  const header = [
    "invoiceId",
    "vendor",
    "invoiceNumber",
    "currency",
    "subtotal",
    "taxAmount",
    "totalPayable",
    "fxRate",
    "fxDate",
    "totalPayableUsd",
    "status",
    "explanation",
    "auditHash",
  ];
  const byId = new Map(records.map((record) => [record.invoiceId, record]));
  const lines = [header.join(",")];

  for (const invoice of invoices) {
    const record = byId.get(invoice.id);
    if (!record) continue;
    lines.push(
      [
        invoice.id,
        invoice.vendorName,
        invoice.invoiceNumber,
        invoice.currency,
        invoice.subtotal,
        invoice.taxAmount,
        invoice.totalPayable,
        record.fxSnapshot?.rateToUsd ?? "",
        record.fxSnapshot?.date ?? "",
        record.totalPayableUsd,
        record.finalStatus,
        record.explanation,
        record.auditHash,
      ]
        .map(cell)
        .join(","),
    );
  }

  return lines.join("\n");
}
