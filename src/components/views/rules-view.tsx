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
  const [over, setOver] = useState<CriterionAction | null>(null);
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
    <>
      <div className="page-heading">
        <div>
          <h1>Reglas</h1>
          <p>Mover un criterio cambia la consecuencia al instante. Duplicado y presupuesto rechazan por defecto. La tasa ausente y la extracción inválida siempre rechazan.</p>
        </div>
      </div>
      <section className="panel">
        <h2>Requisitos para pagar</h2>
        <ul className="checks">
          {session.rules.criteria
            .filter((item) => item.enabled)
            .map((item) => (
              <li key={item.id}>
                <span className="check-icon">✓</span>
                <div>
                  <strong>{CRITERION_LABEL[item.id]}</strong>
                  <small>
                    {valueOf(
                      item,
                      session.rules.maxAutoApproveUsd,
                      session.rules.monthlyBudgetUsd,
                      session.rules.jevConfidenceThreshold,
                      session.rules.semanticDuplicateMinProbability,
                    )}{" "}
                    {item.action === "BLOCKED" ? "Rechazar" : "Por revisar"}
                  </small>
                </div>
              </li>
            ))}
        </ul>
      </section>
      <div className="criteria-board">
        {COLUMNS.map((column) => (
          <section
            key={column.action}
            className={`criteria-lane${over === column.action ? " drag-over" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(column.action);
            }}
            onDragLeave={() => setOver((current) => (current === column.action ? null : current))}
            onDrop={() => {
              if (dragId) move(dragId, column.action);
              setDragId(null);
              setOver(null);
            }}
          >
            <header>
              <h3>{column.title}</h3>
              <span>{column.hint}</span>
            </header>
            {session.rules.criteria
              .filter((item) => item.action === column.action)
              .map((item) => (
                <article
                  key={item.id}
                  className="criterion-card"
                  draggable
                  onDragStart={() => setDragId(item.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOver(null);
                  }}
                >
                  <strong>{CRITERION_LABEL[item.id]}</strong>
                  <p>{item.enabled ? "Activo en el motor." : "Desactivado. No decide esta factura."}</p>
                  <div className="card-controls">
                    <label>
                      <input type="checkbox" checked={item.enabled} onChange={() => toggle(item.id)} />
                      Activo
                    </label>
                  </div>
                  <div className="move-control">
                    <span>Mover a</span>
                    <select value={item.action} onChange={(event) => move(item.id, event.target.value as CriterionAction)}>
                      <option value="ESCALATED">Por revisar</option>
                      <option value="BLOCKED">Rechazado</option>
                    </select>
                  </div>
                </article>
              ))}
          </section>
        ))}
      </div>
      <aside className="panel preview">
        <div className="preview-summary">
          <div>
            <strong>{approved}</strong>
            <small>Pagado</small>
          </div>
          <div>
            <strong>{review}</strong>
            <small>Por revisar</small>
          </div>
          <div>
            <strong>{blocked}</strong>
            <small>Rechazado</small>
          </div>
        </div>
        <label className="field">
          <span>Límite automático (USD)</span>
          <input
            type="number"
            min={100}
            max={2000}
            step={10}
            value={session.rules.maxAutoApproveUsd}
            onChange={(event) => session.updateRules({ ...session.rules, maxAutoApproveUsd: Number(event.target.value) })}
          />
        </label>
        <label className="field">
          <span>Presupuesto del periodo (USD)</span>
          <input
            type="number"
            min={1000}
            max={10000}
            step={100}
            value={session.rules.monthlyBudgetUsd}
            onChange={(event) => session.updateRules({ ...session.rules, monthlyBudgetUsd: Number(event.target.value) })}
          />
        </label>
        <label className="range-field">
          <span>
            Confianza JEV
            <small>{Math.round(session.rules.jevConfidenceThreshold * 100)}%</small>
          </span>
          <input
            type="range"
            min={50}
            max={99}
            step={1}
            value={Math.round(session.rules.jevConfidenceThreshold * 100)}
            onChange={(event) => session.updateRules({ ...session.rules, jevConfidenceThreshold: Number(event.target.value) / 100 })}
          />
        </label>
        <p className="budget-note">
          {session.autonomous.length} de {session.invoices.length} se pagan solas. Disponible {usd(session.available)}. El cambio recalcula el lote al momento.
        </p>
      </aside>
    </>
  );
}

function valueOf(item: RuleCriterion, limit: number, budget: number, confidence: number, semantic: number): string {
  if (item.id === "limit") return `Tope ${usd(limit)}`;
  if (item.id === "budget") return `Presupuesto ${usd(budget)}`;
  if (item.id === "contract") return `Umbral ${Math.round(confidence * 100)}%`;
  if (item.id === "semanticDuplicate") return `Umbral ${Math.round(semantic * 100)}%`;
  return "Criterio del lote";
}
