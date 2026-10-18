"use client";

import { useSession } from "@/components/session/session-provider";
import { hasFilePreview, SyntheticDocument } from "@/components/synthetic-document";
import { describeChecks } from "@/lib/engine/criteria";
import { amount, originLabel, statusClass, statusLabel, usd, vendorDisplay } from "@/lib/format";
import { ArrowLeft, Check, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export function DetailView({ id }: { id: string }) {
  const session = useSession();
  const invoice = session.invoices.find((item) => item.id === id);
  const record = session.records.find((item) => item.invoiceId === id);
  const [note, setNote] = useState("");
  const [missingNote, setMissingNote] = useState(false);

  if (!invoice || !record) {
    return (
      <>
        <Link href="/" className="back">
          <ArrowLeft className="icon" /> Facturas
        </Link>
        <h1>Factura no encontrada</h1>
        <p>Esa factura no está en la sesión actual.</p>
      </>
    );
  }

  const status = session.statusOf(record);
  const checks = describeChecks(invoice, record);
  const highAccount = record.jevResult?.socialEngineeringRisk.score === "HIGH";
  const vendor = session.vendors.find((item) => item.id === invoice.vendorId);
  const requested = invoice.lineItems.find((line) => /cuenta/i.test(line));
  const live = session.live[invoice.id];
  const raw = live?.raw ?? record;
  const suggestions = highAccount
    ? ["Revisé los nuevos datos bancarios con el proveedor.", "La cuenta anterior sigue disponible para próximos pagos."]
    : ["Excepción revisada contra el contrato.", "El monto corresponde al servicio del periodo."];

  function act(decision: "APPROVED" | "BLOCKED") {
    if (!note.trim()) {
      setMissingNote(true);
      return;
    }
    session.decide(invoice!.id, decision, note);
  }

  return (
    <>
      <Link href="/" className="back">
        <ArrowLeft className="icon" /> Facturas
      </Link>
      <div className="detail-heading">
        <h1>{vendorDisplay(invoice.vendorId, invoice.vendorName)}</h1>
        <div className="detail-meta">
          <span>{invoice.id}</span>
          <span>{invoice.invoiceNumber}</span>
          <span>{originLabel(invoice)}</span>
          <span className={statusClass(status)}>{statusLabel(status)}</span>
        </div>
      </div>
      <div className="detail-grid">
        <section className="evidence">
          <div className="evidence-title">
            <span>{invoice.documentLabel}</span>
            <span>{invoice.issueDate}</span>
          </div>
          {hasFilePreview(invoice.documentPath) ? (
            <SyntheticDocument invoice={invoice} />
          ) : invoice.documentKind === "chat" ? (
            <div className="chat-paper">
              <div className="chat-header">{vendorDisplay(invoice.vendorId, invoice.vendorName)} · mensaje</div>
              <div className="chat-bubble">
                <p>{invoice.description}</p>
                {invoice.lineItems.map((line) => (
                  <p key={line}>
                    <strong>{line}</strong>
                  </p>
                ))}
              </div>
              <p className="chat-time">{invoice.issueDate}</p>
            </div>
          ) : (
            <article className={`paper${invoice.documentKind === "thermal" ? " ticket" : ""}${invoice.documentKind === "handwritten" ? " handwritten" : ""}`}>
              <div className="paper-brand">{vendorDisplay(invoice.vendorId, invoice.vendorName)}</div>
              <div className="paper-title">
                <strong>{invoice.documentKind === "thermal" ? "Ticket" : invoice.documentKind === "handwritten" ? "Nota" : "Factura"}</strong>
                <span>{invoice.invoiceNumber}</span>
              </div>
              <p>{invoice.description}</p>
              {invoice.lineItems.map((line) => (
                <div key={line} className="paper-line">
                  <span>{line}</span>
                </div>
              ))}
              <div className="paper-total">
                <span>Total</span>
                <span>{amount(invoice.totalPayable, invoice.currency)}</span>
              </div>
              <p className="paper-stamp">{invoice.evidenceNote}</p>
            </article>
          )}
          <div className="paper-line">
            <span>Subtotal</span>
            <span>{amount(invoice.subtotal, invoice.currency)}</span>
          </div>
          <div className="paper-line">
            <span>Impuestos</span>
            <span>{amount(invoice.taxAmount, invoice.currency)}</span>
          </div>
          <div className="paper-line">
            <span>Total original</span>
            <span>{amount(invoice.totalPayable, invoice.currency)}</span>
          </div>
          <div className="paper-total">
            <span>Total USD</span>
            <span>{record.hardRulesResult.fxValid ? usd(record.totalPayableUsd) : "Sin tasa"}</span>
          </div>
          <p className="budget-note">{invoice.evidenceNote}</p>
        </section>
        <section className="decision-panel">
          <span className={statusClass(status)}>{statusLabel(status)}</span>
          <h2>{status === "APPROVED" ? "Pagado" : status === "ESCALATED" ? "Por revisar" : "Rechazado"}</h2>
          <p className="decision-explanation">{session.explanationOf(invoice, record)}</p>
          <p className="decision-context">SHA-256 {record.auditHash}</p>
          {highAccount ? (
            <div className="bank-warning">
              <h2>Los datos bancarios no coinciden</h2>
              <p>
                Registrada: {vendor?.accounts[0] ?? "sin cuenta"}. Solicitada: {requested ?? "el mensaje no nombra una cuenta"}.
              </p>
            </div>
          ) : null}
          <hr className="divider" />
          <ul className="checks">
            {checks.map((check) => (
              <li key={check.id}>
                <span className={`check-icon${check.pass ? "" : " fail"}`}>
                  {check.pass ? <Check className="icon" /> : "!"}
                </span>
                <div>
                  <strong>{check.label}</strong>
                  <small>
                    {check.detail}
                    {check.action === "BLOCKED" ? " Consecuencia: rechazar." : ""}
                    {check.action === "ESCALATED" ? " Consecuencia: por revisar." : ""}
                    {check.action === "PERMANENT" ? " Condición permanente." : ""}
                  </small>
                </div>
              </li>
            ))}
          </ul>
          {status === "ESCALATED" ? (
            <div className="actions-box">
              <p>
                {highAccount
                  ? "Aprobar añade la cuenta solicitada a la ficha del proveedor y conserva la anterior."
                  : "Añadir contexto ayuda a entender esta decisión cuando se revise más adelante."}
              </p>
              <div className="suggestions">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} className="suggestion" type="button" onClick={() => setNote(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
              <label className="field">
                <span>Nota para la excepción</span>
                <textarea
                  rows={3}
                  value={note}
                  placeholder="Nota para la excepción"
                  onChange={(event) => {
                    setNote(event.target.value);
                    setMissingNote(false);
                  }}
                />
              </label>
              {missingNote ? <p className="notice error">La nota es obligatoria.</p> : null}
              <div className="button-row">
                <button className="btn primary" type="button" onClick={() => act("APPROVED")}>
                  {highAccount ? "Aprobar, añadir cuenta y pagar" : "Aprobar excepción"}
                </button>
                <button className="btn danger" type="button" onClick={() => act("BLOCKED")}>
                  Rechazar
                </button>
                <button className="btn" type="button" onClick={() => void session.notifyOpenClaw(invoice, record)}>
                  Avisar por OpenClaw
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
      <details className="detail-secondary">
        <summary>Registro, JSON y pipeline</summary>
        <div className="inner">
          <p>El hash congela reglas, tasa y veredicto. Re-run solo vuelve a leer si la extracción o la explicación fallan.</p>
          <button className="btn sm" type="button" disabled={session.running} onClick={() => void session.runLive([invoice.id])}>
            <RefreshCw className="icon" /> {session.running ? "Ejecutando…" : "Re-run"}
          </button>
          {live?.timings ? (
            <ul className="checks">
              {live.timings.map((timing) => (
                <li key={timing.layer}>
                  <span>
                    {timing.layer} · {timing.mode}
                    {timing.model ? ` · ${timing.model}` : ""} · {timing.ms} ms
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Esta fila todavía usa el snapshot. El pipeline en vivo deja aquí los tiempos reales.</p>
          )}
          <pre>{JSON.stringify(raw, null, 2)}</pre>
        </div>
      </details>
    </>
  );
}
