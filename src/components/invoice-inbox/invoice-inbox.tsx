"use client";

import { DocumentThumb } from "@/components/synthetic-document";
import { amount, intakeLabel, statusClass, statusLabel, usd } from "@/lib/format";
import type { AuditRecord, DecisionStatus, Invoice } from "@/types/blinka";
import { Flame } from "lucide-react";

const FILTERS: Array<{ id: "ALL" | DecisionStatus; label: string }> = [
  { id: "ALL", label: "Todas" },
  { id: "APPROVED", label: "Pagadas" },
  { id: "ESCALATED", label: "Escaladas" },
  { id: "BLOCKED", label: "Bloqueadas" },
];

export function InvoiceInbox({
  invoices,
  records,
  statusOf,
  filter,
  selectedId,
  running,
  ranLive,
  onFilter,
  onSelect,
  onRerun,
}: {
  invoices: Invoice[];
  records: AuditRecord[];
  statusOf: (record: AuditRecord) => DecisionStatus;
  filter: "ALL" | DecisionStatus;
  selectedId: string;
  running: boolean;
  ranLive: (id: string) => boolean;
  onFilter: (filter: "ALL" | DecisionStatus) => void;
  onSelect: (id: string) => void;
  onRerun: (id: string) => void;
}) {
  const byId = new Map(records.map((record) => [record.invoiceId, record]));
  const counts = {
    ALL: invoices.length,
    APPROVED: records.filter((record) => statusOf(record) === "APPROVED").length,
    ESCALATED: records.filter((record) => statusOf(record) === "ESCALATED").length,
    BLOCKED: records.filter((record) => statusOf(record) === "BLOCKED").length,
  };
  const visible = invoices.filter((invoice) => {
    const record = byId.get(invoice.id);
    return filter === "ALL" || (record ? statusOf(record) === filter : false);
  });

  return (
    <section className="overflow-hidden rounded-xl border border-[#e6e8ee] bg-white">
      <div className="flex flex-wrap gap-2 border-b border-[#e6e8ee] p-3">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            className={`rounded-full px-3 py-1 text-sm ${filter === item.id ? "bg-[#121826] text-white" : "bg-[#f4f6f8] text-[#121826]"}`}
            onClick={() => onFilter(item.id)}
            type="button"
          >
            {item.label} ({counts[item.id]})
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-[#5c6575]">
            <tr>
              <th className="px-3 py-2 font-medium">Factura</th>
              <th className="px-3 py-2 font-medium">Vía</th>
              <th className="px-3 py-2 font-medium">Proveedor</th>
              <th className="px-3 py-2 font-medium">USD</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {visible.map((invoice) => {
              const record = byId.get(invoice.id);
              if (!record) return null;
              const status = statusOf(record);
              const selected = invoice.id === selectedId;
              return (
                <tr
                  key={invoice.id}
                  className={`cursor-pointer border-t border-[#eef0f4] ${selected ? "bg-[#f4f7ff]" : "hover:bg-[#fafbfc]"}`}
                  onClick={() => onSelect(invoice.id)}
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <DocumentThumb invoice={invoice} />
                      <div>
                        <p className="font-medium text-[#121826]">{invoice.id}</p>
                        <p className="text-xs text-[#5c6575]">
                          {!invoice.id.startsWith("INV-") || ranLive(invoice.id) ? "🔥 Pipeline en vivo" : "⚡ Snapshot 0ms"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[#121826]">{intakeLabel(invoice)}</td>
                  <td className="px-3 py-3">
                    <p>{invoice.vendorName}</p>
                    <p className="text-xs text-[#5c6575]">{amount(invoice.totalPayable, invoice.currency)}</p>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{usd(record.totalPayableUsd)}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs ring-1 ${statusClass(status)}`}>
                      {statusLabel(status)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      className="btn"
                      disabled={running}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRerun(invoice.id);
                      }}
                      type="button"
                    >
                      <Flame className="h-3.5 w-3.5" />
                      Re-Run
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
