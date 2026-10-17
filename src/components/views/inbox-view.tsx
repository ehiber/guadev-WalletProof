"use client";

import { useSession } from "@/components/session/session-provider";
import { Button, StatusBadge } from "@/components/ui/ui";
import { amount, intakeLabel, usd, vendorInitials } from "@/lib/format";
import type { DecisionStatus } from "@/types/blinka";
import { Flame, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const FILTERS: Array<{ id: "ALL" | DecisionStatus; label: string }> = [
  { id: "ALL", label: "Todas" },
  { id: "APPROVED", label: "Pagado" },
  { id: "ESCALATED", label: "Por revisar" },
  { id: "BLOCKED", label: "Rechazado" },
];

export function InboxView() {
  const session = useSession();
  const [filter, setFilter] = useState<"ALL" | DecisionStatus>("ALL");
  const [query, setQuery] = useState("");
  const counts = useMemo(() => {
    const tally = { ALL: session.invoices.length, APPROVED: 0, ESCALATED: 0, BLOCKED: 0 };
    for (const record of session.records) tally[session.statusOf(record)] += 1;
    return tally;
  }, [session]);
  const visible = session.invoices.filter((invoice) => {
    const record = session.records.find((item) => item.invoiceId === invoice.id);
    if (!record) return false;
    const matchesFilter = filter === "ALL" || session.statusOf(record) === filter;
    const haystack = `${invoice.vendorName} ${invoice.id} ${invoice.invoiceNumber}`.toLowerCase();
    return matchesFilter && haystack.includes(query.trim().toLowerCase());
  });
  const budget = session.rules.monthlyBudgetUsd || 1;
  const consumedPct = Math.min(100, (session.consumed / budget) * 100);
  const retainedPct = Math.min(100 - consumedPct, (session.retained / budget) * 100);

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-tight font-semibold tracking-tight">Facturas</h1>
          <p className="mt-2 text-[13px] text-muted">Estado, motivo y evidencia del lote sintético de NovaLatam.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/facturas/nueva" className="inline-flex min-h-10 items-center rounded-full bg-accent px-3.5 text-xs font-semibold text-white no-underline hover:bg-accent-hover">
            Añadir factura
          </Link>
        </div>
      </div>
      {session.liveError ? <p className="mb-5 rounded-lg bg-danger-bg px-4 py-3 text-xs text-danger">{session.liveError}</p> : null}
      <div className="mb-7 grid gap-8 border-b border-line pb-6 lg:grid-cols-[1fr_1.25fr]">
        <div className="grid grid-cols-3 gap-3">
          <Summary label="Pagado" value={counts.APPROVED} tone="text-approved" />
          <Summary label="Por revisar" value={counts.ESCALATED} tone="text-warn" />
          <Summary label="Rechazado" value={counts.BLOCKED} tone="text-danger" />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span>Presupuesto del periodo</span>
            <strong className="text-base">{usd(session.available)} disponibles</strong>
          </div>
          <div className="flex h-2 overflow-hidden rounded-sm bg-[#e5e8ef]">
            <span className="bg-accent" style={{ width: `${consumedPct}%` }} />
            <span className="bg-[#d6b15a]" style={{ width: `${retainedPct}%` }} />
          </div>
          <p className="mt-2 text-[10px] text-muted">
            Consumido {usd(session.consumed)} · Retenido {usd(session.retained)} · Tope {usd(session.rules.monthlyBudgetUsd)}
          </p>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                className={`rounded-md px-2.5 py-2 text-[11px] font-semibold ${filter === item.id ? "bg-nav-active text-ink" : "text-muted hover:bg-[#f0f2fa]"}`}
                onClick={() => setFilter(item.id)}
              >
                {item.label} <span>{item.id === "ALL" ? counts.ALL : counts[item.id]}</span>
              </button>
            ))}
          </div>
          <label className="flex min-w-[180px] items-center gap-2 rounded-md border border-line px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar proveedor o factura"
              className="w-full border-0 bg-transparent text-[11px] outline-none"
            />
          </label>
        </div>
        {visible.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted">Ninguna factura coincide con este filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="bg-[#fafafb] text-[10px] tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">PROVEEDOR / FACTURA</th>
                  <th className="px-4 py-3 font-medium">TOTAL</th>
                  <th className="px-4 py-3 font-medium">DECISIÓN</th>
                  <th className="px-4 py-3 font-medium">ORIGEN</th>
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((invoice) => {
                  const record = session.records.find((item) => item.invoiceId === invoice.id);
                  if (!record) return null;
                  const status = session.statusOf(record);
                  return (
                    <tr key={invoice.id} className="border-t border-[#edf0f6] text-xs hover:bg-[#f7f8fc]">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-[#eef1f7] text-[10px] font-semibold text-muted">
                            {vendorInitials(invoice.vendorId, invoice.vendorName)}
                          </span>
                          <div>
                            <strong className="block text-xs">{invoice.vendorName}</strong>
                            <small className="text-[10px] text-muted">
                              {invoice.id} · {intakeLabel(invoice)}
                              {session.live[invoice.id] ? " · Pipeline en vivo" : " · Snapshot"}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-semibold">{usd(record.totalPayableUsd)}</div>
                        <small className="text-[10px] text-muted">{amount(invoice.totalPayable, invoice.currency)}</small>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={status} />
                        <p className="mt-1 max-w-[220px] text-[10px] text-muted">{record.explanation}</p>
                      </td>
                      <td className="px-4 py-4 text-muted">{invoice.issueDate}</td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="text" disabled={session.running} onClick={() => void session.runLive([invoice.id])} type="button">
                            <Flame className="h-3.5 w-3.5" /> Re-run
                          </Button>
                          <Link href={`/facturas/${invoice.id}`} className="text-[11px] font-semibold text-accent no-underline">
                            Abrir
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="border-r border-line pr-3 last:border-0">
      <p className={`flex items-center gap-1.5 text-xs text-muted`}>
        <span className={`inline-block h-1.5 w-1.5 rounded-full bg-current ${tone}`} />
        {label}
      </p>
      <strong className="mt-2 block text-[30px] leading-tight font-medium tracking-tight">{value}</strong>
    </div>
  );
}
