"use client";

import { useSession } from "@/components/session/session-provider";
import { Button, StatusBadge } from "@/components/ui/ui";
import { usd } from "@/lib/format";
import Link from "next/link";

export function ActivityView() {
  const session = useSession();
  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-tight font-semibold tracking-tight">Registro</h1>
          <p className="mt-2 text-[13px] text-muted">Cada fila congela reglas, tasa y veredicto. El hash cambia si cambia la configuración, no el método.</p>
        </div>
        <Button type="button" onClick={session.exportCsv}>Exportar CSV</Button>
      </div>
      <ol className="rounded-xl border border-line bg-surface px-5">
        {session.records.map((record) => {
          const invoice = session.invoices.find((item) => item.id === record.invoiceId);
          const status = session.statusOf(record);
          return (
            <li key={record.invoiceId} className="grid gap-3 border-b border-line py-5 last:border-0 md:grid-cols-[1fr_auto]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xs font-semibold">{invoice?.vendorName ?? record.invoiceId}</h2>
                  <StatusBadge status={status} />
                </div>
                <p className="mt-1 text-[11px] text-muted">{invoice ? session.explanationOf(invoice, record) : record.explanation}</p>
                <p className="mt-2 font-mono text-[10px] break-all text-muted">{record.auditHash}</p>
              </div>
              <div className="text-right text-xs">
                <strong className="block">{usd(record.totalPayableUsd)}</strong>
                <Link href={`/facturas/${record.invoiceId}`} className="text-[11px] text-accent no-underline">
                  Abrir {record.invoiceId}
                </Link>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
