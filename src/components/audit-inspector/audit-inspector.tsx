"use client";

import { SyntheticDocument } from "@/components/synthetic-document";
import { amount, statusClass, statusLabel, usd } from "@/lib/format";
import type { LayerTiming } from "@/lib/engine/live-pipeline";
import type { AuditRecord, DecisionStatus, Invoice, JevResult } from "@/types/blinka";
import { useState } from "react";

export function AuditInspector({
  invoice,
  record,
  status,
  timings,
  explanation,
  raw,
  showRaw,
  onToggleRaw,
  onApprove,
  onReject,
  onNotify,
}: {
  invoice: Invoice;
  record: AuditRecord;
  status: DecisionStatus;
  timings?: LayerTiming[];
  explanation: string;
  raw: unknown;
  showRaw: boolean;
  onToggleRaw: () => void;
  onApprove: (note: string) => void;
  onReject: (note: string) => void;
  onNotify: () => void;
}) {
  const jev = record.jevResult ?? invoice.jevSnapshot;
  const consulted = record.jevResult !== null;

  return (
    <section className="grid gap-4 rounded-xl border border-[#e6e8ee] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-[#5c6575]">{invoice.documentLabel}</p>
          <h2 className="text-lg font-semibold text-[#121826]">{invoice.id}</h2>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs ring-1 ${statusClass(status)}`}>{statusLabel(status)}</span>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-3">
          <SyntheticDocument invoice={invoice} />
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Fact label="Subtotal" value={amount(invoice.subtotal, invoice.currency)} />
            <Fact label="Impuestos" value={amount(invoice.taxAmount, invoice.currency)} />
            <Fact label="Total original" value={amount(invoice.totalPayable, invoice.currency)} />
            <Fact
              label="Tasa FX"
              value={record.fxSnapshot ? `${record.fxSnapshot.rateToUsd} · ${record.fxSnapshot.date}` : "Sin tasa"}
            />
            <Fact label="Total USD" value={usd(record.totalPayableUsd)} />
          </dl>
        </div>
        <div className="space-y-4">
          <CheckList record={record} />
          <JevBars jev={jev} consulted={consulted} />
          {timings ? <Stepper timings={timings} /> : null}
          <p className="text-sm leading-6 text-[#121826]">{explanation}</p>
          <p className="break-all font-mono text-[11px] text-[#5c6575]">SHA-256 {record.auditHash}</p>
          <button className="btn" onClick={onToggleRaw} type="button">
            {showRaw ? "Ocultar JSON" : "{ } Ver JSON crudo"}
          </button>
          {showRaw ? (
            <pre className="max-h-64 overflow-auto rounded-lg bg-[#121826] p-3 text-[11px] leading-5 text-[#e7ecf5]">
              {JSON.stringify(raw, null, 2)}
            </pre>
          ) : null}
          {record.finalStatus === "ESCALATED" ? (
            <HumanActions onApprove={onApprove} onReject={onReject} onNotify={onNotify} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#f4f6f8] px-3 py-2">
      <dt className="text-xs text-[#5c6575]">{label}</dt>
      <dd className="tabular-nums text-[#121826]">{value}</dd>
    </div>
  );
}

function CheckList({ record }: { record: AuditRecord }) {
  const hard = record.hardRulesResult;
  const rows = [
    ["Proveedor en whitelist", hard.isVendorWhitelisted],
    ["Anti-duplicado exacto", !hard.isExactDuplicate],
    ["Conversión FX", hard.fxValid],
    ["Límite individual", hard.isWithinSingleLimit],
    ["Presupuesto mensual", hard.isWithinPeriodBudget],
  ] as const;
  return (
    <ul className="space-y-1 text-sm">
      {rows.map(([label, ok]) => (
        <li key={label} className="flex items-center justify-between gap-3">
          <span>{label}</span>
          <span className={ok ? "text-emerald-700" : "text-rose-700"}>{ok ? "✓" : "✗"}</span>
        </li>
      ))}
    </ul>
  );
}

function JevBars({ jev, consulted }: { jev: JevResult; consulted: boolean }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs uppercase tracking-wide text-[#5c6575]">
        {consulted ? "JEV consultado" : "JEV no consultado · snapshot en archivo"}
      </p>
      <Bar label="Coherencia con contrato" value={jev.contractCoherence.probability} />
      <Bar label="No es duplicado semántico" value={jev.semanticDuplicate.probability} />
      <p>
        Anomalía <strong>{jev.socialEngineeringRisk.score}</strong> · Centro {jev.costCenter.choice}
      </p>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-[#5c6575]">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-[#eef0f4]">
        <div className="h-1.5 rounded-full bg-[#121826]" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

function Stepper({ timings }: { timings: LayerTiming[] }) {
  return (
    <ol className="space-y-1 text-xs text-[#5c6575]">
      {timings.map((timing) => (
        <li key={timing.layer} className="flex justify-between gap-3">
          <span>
            {timing.layer} · {timing.mode}
            {timing.model ? ` · ${timing.model}` : ""}
          </span>
          <span className="tabular-nums">{timing.ms} ms</span>
        </li>
      ))}
    </ol>
  );
}

function HumanActions({
  onApprove,
  onReject,
  onNotify,
}: {
  onApprove: (note: string) => void;
  onReject: (note: string) => void;
  onNotify: () => void;
}) {
  const [missingNote, setMissingNote] = useState(false);

  function noteFrom(event: React.MouseEvent<HTMLButtonElement>): string {
    const form = event.currentTarget.form;
    if (!form) return "";
    const note = String(new FormData(form).get("note") ?? "").trim();
    setMissingNote(note.length === 0);
    return note;
  }

  return (
    <form className="space-y-2" onSubmit={(event) => event.preventDefault()}>
      <textarea
        name="note"
        placeholder="Nota obligatoria para la excepción"
        className="w-full rounded-lg border border-[#e6e8ee] px-3 py-2 text-sm"
        rows={3}
        onChange={() => setMissingNote(false)}
      />
      {missingNote ? <p className="text-sm text-rose-700">La nota es obligatoria.</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          className="btn"
          type="button"
          onClick={(event) => {
            const note = noteFrom(event);
            if (note) onApprove(note);
          }}
        >
          Aprobar excepción
        </button>
        <button
          className="btn"
          type="button"
          onClick={(event) => {
            const note = noteFrom(event);
            if (note) onReject(note);
          }}
        >
          Rechazar
        </button>
        <button className="btn" onClick={onNotify} type="button">
          Avisar por OpenClaw
        </button>
      </div>
    </form>
  );
}
