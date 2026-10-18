"use client";

import { useSession } from "@/components/session/session-provider";
import { describeChecks } from "@/lib/engine/criteria";
import { originLabel, payableLines, shortReason, statusClass, statusLabel, usd, vendorDisplay, vendorInitials } from "@/lib/format";
import type { DecisionStatus } from "@/types/blinka";
import { ArrowRight, Download, Plus, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const FILTERS: Array<{ id: "ALL" | DecisionStatus; label: string }> = [
  { id: "ALL", label: "Todas" },
  { id: "ESCALATED", label: "Por revisar" },
  { id: "APPROVED", label: "Pagados" },
  { id: "BLOCKED", label: "Rechazados" },
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
    const haystack = `${vendorDisplay(invoice.vendorId, invoice.vendorName)} ${invoice.id} ${invoice.invoiceNumber}`.toLowerCase();
    return matchesFilter && haystack.includes(query.trim().toLowerCase());
  });
  const budget = session.rules.monthlyBudgetUsd || 1;
  const consumedPct = Math.min(100, (session.consumed / budget) * 100);
  const retainedPct = Math.min(100 - consumedPct, (session.retained / budget) * 100);
  const automatic = counts.APPROVED + counts.BLOCKED;

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Facturas</h1>
          <p>Cada factura, una decisión. Cada decisión, una explicación.</p>
        </div>
        <div className="heading-actions">
          <Link className="btn primary" href="/facturas/nueva">
            <Plus className="icon" /> Añadir factura
          </Link>
          <button className="btn" type="button" onClick={session.exportCsv}>
            <Download className="icon" /> Exportar CSV
          </button>
          <button
            className="btn"
            type="button"
            disabled={session.running}
            onClick={() => void session.runLive(session.invoices.map((invoice) => invoice.id))}
          >
            <RefreshCw className="icon" /> {session.running ? "Revisando…" : "Revisar con IA"}
          </button>
        </div>
      </div>
      {session.liveError ? (
        <div className="notice error">
          <p>{session.liveError}</p>
        </div>
      ) : null}
      <div className="callout">
        <div className="callout-icon" aria-hidden="true">
          {counts.ESCALATED ? "!" : "✓"}
        </div>
        <div>
          <strong>{counts.ESCALATED ? `${counts.ESCALATED} facturas necesitan tu criterio` : "Todo revisado por ahora"}</strong>
          <p>
            {counts.ESCALATED
              ? "Revisa las excepciones y deja constancia de tu decisión."
              : "Las decisiones están registradas y disponibles para consulta."}
          </p>
        </div>
        <button className="btn sm" type="button" onClick={() => setFilter(counts.ESCALATED ? "ESCALATED" : "ALL")}>
          {counts.ESCALATED ? "Revisar pendientes" : "Ver decisiones"} <ArrowRight className="icon" />
        </button>
      </div>
      <div className="overview">
        <div className="status-summary">
          <div>
            <span className="status-label">
              <span className="dot" style={{ color: "#46734c" }} />
              Pagados
            </span>
            <strong>{counts.APPROVED}</strong>
            <small>Pago simulado registrado</small>
          </div>
          <div>
            <span className="status-label">
              <span className="dot" style={{ color: "#987022" }} />
              Por revisar
            </span>
            <strong>{counts.ESCALATED}</strong>
            <small>Decisión humana</small>
          </div>
          <div>
            <span className="status-label">
              <span className="dot" style={{ color: "#a4554c" }} />
              Rechazados
            </span>
            <strong>{counts.BLOCKED}</strong>
            <small>No continúa al pago</small>
          </div>
        </div>
        <div>
          <div className="budget-head">
            <span>Disponible del periodo</span>
            <strong>
              {usd(session.available)} <span className="small muted">USD</span>
            </strong>
          </div>
          <div
            className="budget-bar"
            role="img"
            aria-label={`Presupuesto ${usd(session.rules.monthlyBudgetUsd)}, pagado ${usd(session.consumed)}, retenido ${usd(session.retained)}, disponible ${usd(session.available)}`}
          >
            <span className="budget-approved" style={{ width: `${consumedPct}%` }} />
            <span className="budget-prior" style={{ width: `${retainedPct}%` }} />
          </div>
          <div className="budget-legend">
            <span>Pagado {usd(session.consumed)}</span>
            <span>Retenido {usd(session.retained)}</span>
            <span>Total {usd(session.rules.monthlyBudgetUsd)}</span>
          </div>
          <p className="budget-note">Los pagos registrados consumen presupuesto. Lo retenido espera criterio.</p>
        </div>
      </div>
      <div className="section-heading">
        <div>
          <h2>
            Facturas del periodo <span className="muted small">/ {session.invoices.length}</span>
          </h2>
          <p>
            {automatic} de {session.invoices.length} resueltas automáticamente · incluye pagos y rechazos.
          </p>
        </div>
        <Link href="/reglas">Reglas vigentes</Link>
      </div>
      <section className="table-card" aria-label="Facturas">
        <div className="table-toolbar">
          <div className="tabs" role="tablist" aria-label="Filtrar por decisión">
            {FILTERS.map((item) => (
              <button key={item.id} className="tab" type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                {item.label}
                <span>{item.id === "ALL" ? counts.ALL : counts[item.id]}</span>
              </button>
            ))}
          </div>
          <label className="search">
            <Search className="icon" />
            <span className="visually-hidden">Buscar proveedor o factura</span>
            <input type="search" value={query} placeholder="Buscar proveedor o factura" onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        {visible.length === 0 ? (
          <div className="empty">
            <h3>Sin resultados</h3>
            <p>Ninguna factura coincide con este filtro.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">PROVEEDOR / FACTURA</th>
                  <th scope="col">TOTAL</th>
                  <th scope="col">DECISIÓN</th>
                  <th scope="col">VENCE</th>
                  <th scope="col">
                    <span className="visually-hidden">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((invoice) => {
                  const record = session.records.find((item) => item.invoiceId === invoice.id)!;
                  const status = session.statusOf(record);
                  const failed = describeChecks(invoice, record).find((check) => !check.pass);
                  const payable = payableLines(invoice.totalPayable, invoice.currency, record.totalPayableUsd, record.hardRulesResult.fxValid);
                  return (
                    <tr key={invoice.id}>
                      <td className="vendor-td">
                        <div className="vendor-cell">
                          <span className="vendor-icon">{vendorInitials(invoice.vendorId, invoice.vendorName)}</span>
                          <div>
                            <strong>{vendorDisplay(invoice.vendorId, invoice.vendorName)}</strong>
                            <small>
                              {invoice.id} · {originLabel(invoice)}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td className="money">
                        {payable.primary}
                        {payable.secondary ? <small>{payable.secondary}</small> : null}
                      </td>
                      <td>
                        <span className={statusClass(status)}>{statusLabel(status)}</span>
                        <div className="reason-short">{shortReason(failed?.id, status)}</div>
                      </td>
                      <td>—</td>
                      <td>
                        <Link className="row-link" href={`/facturas/${invoice.id}`}>
                          Ver detalle <ArrowRight className="icon" />
                        </Link>
                        <button className="text-btn" type="button" disabled={session.running} onClick={() => void session.runLive([invoice.id])}>
                          Re-run
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="page-footer">Solo facturas sintéticas. El total en USD es el del registro.</p>
    </>
  );
}
