"use client";

import { SyntheticDocument } from "@/components/synthetic-document";
import { useSession } from "@/components/session/session-provider";
import { Button, StatusBadge } from "@/components/ui/ui";
import { describeChecks } from "@/lib/engine/criteria";
import { amount, intakeLabel, usd } from "@/lib/format";
import { ArrowLeft } from "lucide-react";
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
      <div>
        <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-xs text-accent no-underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Facturas
        </Link>
        <h1 className="text-[28px] font-semibold">Factura no encontrada</h1>
        <p className="mt-2 text-sm text-muted">Esa factura no está en la sesión actual.</p>
      </div>
    );
  }

  const status = session.statusOf(record);
  const checks = describeChecks(invoice, record);
  const highAccount = record.jevResult?.socialEngineeringRisk.score === "HIGH";
  const live = session.live[invoice.id];
  const raw = live?.raw ?? record;

  function act(decision: "APPROVED" | "BLOCKED") {
    if (!note.trim()) {
      setMissingNote(true);
      return;
    }
    session.decide(invoice!.id, decision, note);
  }

  return (
    <div>
      <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-xs text-accent no-underline">
        <ArrowLeft className="h-3.5 w-3.5" /> Facturas
      </Link>
      <div className="mb-6">
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{invoice.vendorName}</h1>
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5 text-xs text-muted">
          <span>{invoice.id}</span>
          <span>{invoice.invoiceNumber}</span>
          <span>{intakeLabel(invoice)}</span>
          <StatusBadge status={status} />
        </div>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(280px,0.95fr)_minmax(340px,1.05fr)]">
        <section className="rounded-xl border border-[#dce0e8] bg-[#edf0f6] p-5">
          <div className="mb-4 flex items-center justify-between text-[11px] text-muted">
            <span>{invoice.documentLabel}</span>
            <span>{invoice.issueDate}</span>
          </div>
          <SyntheticDocument invoice={invoice} />
          <dl className="mt-5 grid grid-cols-2 gap-x-4">
            <Fact label="Subtotal" value={amount(invoice.subtotal, invoice.currency)} />
            <Fact label="Impuestos" value={amount(invoice.taxAmount, invoice.currency)} />
            <Fact label="Total original" value={amount(invoice.totalPayable, invoice.currency)} />
            <Fact label="Total USD" value={usd(record.totalPayableUsd)} />
          </dl>
          <p className="mt-3 text-[10px] leading-relaxed text-muted">{invoice.evidenceNote}</p>
        </section>
        <section className="rounded-xl border border-line bg-surface p-6">
          <StatusBadge status={status} />
          <h2 className="mt-4 text-[22px] font-semibold tracking-tight">{status === "APPROVED" ? "Pagado" : status === "ESCALATED" ? "Por revisar" : "Rechazado"}</h2>
          <p className="mt-2 text-[13px] leading-7 text-muted">{session.explanationOf(invoice, record)}</p>
          <p className="mt-3 font-mono text-[10px] break-all text-muted">SHA-256 {record.auditHash}</p>
          <hr className="my-5 border-0 border-t border-line" />
          <ul className="space-y-1">
            {checks.map((check) => (
              <li key={check.id} className="flex gap-2.5 py-2">
                <span className={`mt-0.5 grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full text-[10px] ${check.pass ? "bg-[#ebf3e6] text-[#4a754c]" : "bg-[#f7ecdb] text-[#956922]"}`}>
                  {check.pass ? "✓" : "!"}
                </span>
                <div>
                  <strong className="block text-[11px] font-medium">{check.label}</strong>
                  <small className="text-[10px] text-muted">
                    {check.detail}
                    {check.action === "BLOCKED" ? " Consecuencia: rechazar." : ""}
                    {check.action === "ESCALATED" ? " Consecuencia: por revisar." : ""}
                    {check.action === "PERMANENT" ? " Condición permanente." : ""}
                  </small>
                </div>
              </li>
            ))}
          </ul>
          {live?.timings ? (
            <ol className="mt-4 space-y-1 text-[11px] text-muted">
              {live.timings.map((timing) => (
                <li key={timing.layer} className="flex justify-between gap-3">
                  <span>
                    {timing.layer} · {timing.mode}
                    {timing.model ? ` · ${timing.model}` : ""}
                  </span>
                  <span>{timing.ms} ms</span>
                </li>
              ))}
            </ol>
          ) : null}
          {status === "ESCALATED" ? (
            <div className="mt-6 border-t border-line pt-5">
              <p className="text-[11px] text-muted">Añadir contexto ayuda a entender esta decisión cuando se revise más adelante.</p>
              {highAccount ? (
                <p className="mt-2 text-[11px] text-muted">Aprobar añade la cuenta solicitada a la ficha del proveedor y conserva la anterior.</p>
              ) : null}
              <textarea
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                  setMissingNote(false);
                }}
                rows={3}
                placeholder="Nota para la excepción"
                className="field mt-3"
              />
              {missingNote ? <p className="mt-2 text-[11px] text-danger">La nota es obligatoria.</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" type="button" onClick={() => act("APPROVED")}>
                  {highAccount ? "Aprobar y añadir cuenta" : "Aprobar excepción"}
                </Button>
                <Button variant="danger" type="button" onClick={() => act("BLOCKED")}>
                  Rechazar
                </Button>
                <Button type="button" onClick={() => void session.notifyOpenClaw(invoice, record)}>
                  Avisar por OpenClaw
                </Button>
              </div>
            </div>
          ) : null}
          <div className="mt-5">
            <Button type="button" onClick={() => session.setShowRaw((value) => !value)}>
              {session.showRaw ? "Ocultar JSON" : "Ver JSON"}
            </Button>
            {session.showRaw ? (
              <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-[#f4f6fc] p-3.5 text-[10px] leading-relaxed text-[#3d4c71]">
                {JSON.stringify(raw, null, 2)}
              </pre>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[#dce0e8] py-2.5">
      <dt className="text-[10px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-xs font-medium">{value}</dd>
    </div>
  );
}
