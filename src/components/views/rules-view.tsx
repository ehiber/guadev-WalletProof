"use client";

import { useSession } from "@/components/session/session-provider";
import { CRITERION_LABEL } from "@/lib/engine/criteria";
import { usd } from "@/lib/format";
import type { CriterionAction, CriterionId, RuleCriterion } from "@/types/blinka";
import { useState } from "react";

const COLUMNS: Array<{ action: CriterionAction; title: string; hint: string }> = [
  { action: "ESCALATED", title: "Por revisar", hint: "Si falla, una persona decide." },
  { action: "BLOCKED", title: "Rechazado", hint: "Si falla, el pago se frena." },
];

export function RulesView() {
  const session = useSession();
  const [dragId, setDragId] = useState<CriterionId | null>(null);
  const approved = session.records.filter((record) => session.statusOf(record) === "APPROVED").length;
  const review = session.records.filter((record) => session.statusOf(record) === "ESCALATED").length;
  const blocked = session.records.filter((record) => session.statusOf(record) === "BLOCKED").length;

  function move(id: CriterionId, action: CriterionAction) {
    session.updateRules({
      ...session.rules,
      criteria: session.rules.criteria.map((item) => (item.id === id ? { ...item, action } : item)),
    });
  }

  function toggle(id: CriterionId) {
    session.updateRules({
      ...session.rules,
      criteria: session.rules.criteria.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item)),
    });
  }

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-[32px] leading-tight font-semibold tracking-tight">Reglas</h1>
        <p className="mt-2 max-w-[72ch] text-[13px] text-muted">
          Mover un criterio cambia la consecuencia al instante. Duplicado y presupuesto rechazan por defecto; la lista, el tope y JEV quedan por revisar. La tasa ausente y la extracción inválida siempre rechazan.
        </p>
      </div>
      <ul className="mb-6 grid gap-2 md:grid-cols-2">
        {session.rules.criteria.filter((item) => item.enabled).map((item) => (
          <li key={item.id} className="rounded-lg border border-line bg-surface px-3 py-2 text-xs">
            <strong>{CRITERION_LABEL[item.id]}</strong>
            <span className="mt-1 block text-[11px] text-muted">
              {valueOf(item, session.rules.maxAutoApproveUsd, session.rules.monthlyBudgetUsd, session.rules.jevConfidenceThreshold)} · {item.action === "BLOCKED" ? "Rechazar" : "Por revisar"}
            </span>
          </li>
        ))}
      </ul>
      <div className="grid items-start gap-7 lg:grid-cols-2">
        <div className="grid gap-4">
          {COLUMNS.map((column) => (
            <section
              key={column.action}
              className="rounded-xl border border-line bg-surface p-6"
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragId) move(dragId, column.action);
                setDragId(null);
              }}
            >
              <h2 className="text-lg font-semibold">{column.title}</h2>
              <p className="mt-1 mb-4 text-xs text-muted">{column.hint}</p>
              <div className="grid gap-2">
                {session.rules.criteria
                  .filter((item) => item.action === column.action)
                  .map((item) => (
                    <article
                      key={item.id}
                      draggable
                      onDragStart={() => setDragId(item.id)}
                      className={`rounded-[10px] border border-line px-3 py-3 ${item.enabled ? "bg-white" : "bg-[#f4f6fc] opacity-70"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <strong className="block text-xs">{CRITERION_LABEL[item.id]}</strong>
                          <small className="text-[10px] text-muted">{item.enabled ? "Activo" : "Desactivado"}</small>
                        </div>
                        <label className="flex items-center gap-1.5 text-[11px]">
                          <input type="checkbox" checked={item.enabled} onChange={() => toggle(item.id)} />
                          Usar
                        </label>
                      </div>
                      <label className="mt-3 block text-[11px] font-semibold">
                        Mover a
                        <select
                          className="field mt-1"
                          value={item.action}
                          onChange={(event) => move(item.id, event.target.value as CriterionAction)}
                        >
                          <option value="ESCALATED">Por revisar</option>
                          <option value="BLOCKED">Rechazado</option>
                        </select>
                      </label>
                    </article>
                  ))}
              </div>
            </section>
          ))}
        </div>
        <aside className="rounded-xl border border-line bg-surface p-6 lg:sticky lg:top-24">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Resultado ahora</h2>
            <span className="rounded-[5px] bg-approved-bg px-1.5 py-1 text-[9px] font-semibold text-approved">En vivo</span>
          </div>
          <div className="my-5 flex gap-6">
            <Count label="Pagado" value={approved} />
            <Count label="Por revisar" value={review} />
            <Count label="Rechazado" value={blocked} />
          </div>
          <Slider
            label="Límite automático"
            min={100}
            max={2000}
            step={10}
            value={session.rules.maxAutoApproveUsd}
            display={usd(session.rules.maxAutoApproveUsd)}
            onChange={(maxAutoApproveUsd) => session.updateRules({ ...session.rules, maxAutoApproveUsd })}
          />
          <Slider
            label="Presupuesto del periodo"
            min={1000}
            max={10000}
            step={100}
            value={session.rules.monthlyBudgetUsd}
            display={usd(session.rules.monthlyBudgetUsd)}
            onChange={(monthlyBudgetUsd) => session.updateRules({ ...session.rules, monthlyBudgetUsd })}
          />
          <Slider
            label="Confianza JEV"
            min={50}
            max={99}
            step={1}
            value={Math.round(session.rules.jevConfidenceThreshold * 100)}
            display={`${Math.round(session.rules.jevConfidenceThreshold * 100)}%`}
            onChange={(percent) => session.updateRules({ ...session.rules, jevConfidenceThreshold: percent / 100 })}
          />
          <p className="mt-4 text-[11px] text-muted">
            {session.autonomous.length} de {session.invoices.length} se pagan solas con el veredicto del motor. Disponible {usd(session.available)}.
          </p>
        </aside>
      </div>
    </div>
  );
}

function valueOf(item: RuleCriterion, limit: number, budget: number, confidence: number): string {
  if (item.id === "limit") return `Tope ${usd(limit)}`;
  if (item.id === "budget") return `Presupuesto ${usd(budget)}`;
  if (item.id === "contract" || item.id === "semanticDuplicate") return `Umbral ${Math.round(confidence * 100)}%`;
  return "Criterio del lote";
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <strong className="block text-[26px] leading-tight font-medium">{value}</strong>
      <small className="text-[10px] text-muted">{label}</small>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="mt-4 block text-xs font-semibold">
      <span className="flex justify-between">
        {label}
        <span className="font-medium text-muted">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-accent"
      />
    </label>
  );
}
