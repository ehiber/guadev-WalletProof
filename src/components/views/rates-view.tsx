"use client";

import { useSession } from "@/components/session/session-provider";
import { usd } from "@/lib/format";
import { DEMO_ISSUE_DATE, fxTickerRates } from "@/lib/mock-data/fx-ledger";
import Link from "next/link";
import { useMemo, useState } from "react";

export function RatesView() {
  const session = useSession();
  const rates = fxTickerRates();
  const [query, setQuery] = useState("");
  const visible = useMemo(
    () => rates.filter((rate) => `${rate.currency} ${rate.source}`.toLowerCase().includes(query.trim().toLowerCase())),
    [query, rates],
  );
  const used = session.records.filter((record) => record.fxSnapshot);

  return (
    <div>
      <h1 className="text-[32px] leading-tight font-semibold tracking-tight">Tasas de cambio</h1>
      <p className="mt-2 mb-7 max-w-[72ch] text-[13px] text-muted">
        El veredicto usa el libro sintético del {DEMO_ISSUE_DATE}. Esta pantalla no consulta una cotización externa.
      </p>
      <label className="mb-5 block max-w-sm">
        <span className="mb-1.5 block text-xs font-semibold">Buscar par</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="COP, MXN, fuente…" className="field mt-0" />
      </label>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map((rate) => (
          <article key={rate.currency} className="rounded-xl border border-line bg-surface p-5">
            <div className="flex justify-between text-xs">
              <span>USD → {rate.currency}</span>
              <span className="text-[10px] text-muted">{rate.date}</span>
            </div>
            <b className="mt-1.5 block text-2xl font-medium tracking-tight">{rate.rateToUsd}</b>
            <small className="text-[10px] text-muted">{rate.source}</small>
          </article>
        ))}
      </div>
      {visible.length === 0 ? <p className="mt-4 text-sm text-muted">Ningún par coincide.</p> : null}
      <section className="mt-8 rounded-xl border border-line bg-surface p-6">
        <h2 className="text-lg font-semibold">Conversiones del lote</h2>
        <ul className="mt-4 divide-y divide-line">
          {used.map((record) => {
            const invoice = session.invoices.find((item) => item.id === record.invoiceId);
            if (!invoice || !record.fxSnapshot) return null;
            return (
              <li key={record.invoiceId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                <Link href={`/facturas/${invoice.id}`} className="font-semibold text-accent no-underline">
                  {invoice.id} · {invoice.currency}
                </Link>
                <span>
                  {invoice.totalPayable} / {record.fxSnapshot.rateToUsd} = {usd(record.totalPayableUsd)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <p className="mt-4 text-[11px] text-muted">La fuente diaria no cambia el veredicto. La tasa queda congelada en el hash de cada decisión.</p>
    </div>
  );
}
