"use client";

import { AuditInspector } from "@/components/audit-inspector/audit-inspector";
import { ByokModal } from "@/components/byok-modal";
import { InvoiceInbox } from "@/components/invoice-inbox/invoice-inbox";
import { Navbar } from "@/components/navbar/navbar";
import { OpenClawDrawer } from "@/components/openclaw-drawer/openclaw-drawer";
import { RuleBuilder } from "@/components/rule-builder/rule-builder";
import { evaluateBatch } from "@/lib/engine/pipeline";
import type { LayerTiming } from "@/lib/engine/live-pipeline";
import type { ByokKeys } from "@/lib/engine/model-provider";
import { usd } from "@/lib/format";
import { recordsToCsv } from "@/lib/utils/export-csv";
import { DEFAULT_RULES } from "@/lib/mock-data/company-rules";
import { INITIAL_DATASET } from "@/lib/mock-data/initial-dataset";
import { OPENCLAW_DEMO_SECRET } from "@/lib/openclaw/constants";
import type { AuditRecord, CompanyRules, DecisionStatus, Invoice } from "@/types/blinka";
import { useMemo, useState, useSyncExternalStore } from "react";

const KEYS_STORAGE = "blinka-byok";
const KEYS_EVENT = "blinka-byok-change";

function subscribeKeys(onChange: () => void) {
  window.addEventListener(KEYS_EVENT, onChange);
  return () => window.removeEventListener(KEYS_EVENT, onChange);
}

function readStoredKeys() {
  return window.localStorage.getItem(KEYS_STORAGE) ?? "";
}

function parseKeys(raw: string): ByokKeys {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ByokKeys;
  } catch {
    return {};
  }
}

type HumanDecision = { decision: "APPROVED" | "BLOCKED"; note: string };
type LiveMeta = {
  timings: LayerTiming[];
  raw: unknown;
  explanation: { text: string; mode: "live" | "fallback" };
};

export function Dashboard() {
  const [rules, setRules] = useState<CompanyRules>(DEFAULT_RULES);
  const [invoices, setInvoices] = useState<Invoice[]>(INITIAL_DATASET);
  const [selectedId, setSelectedId] = useState("INV-01");
  const [filter, setFilter] = useState<"ALL" | DecisionStatus>("ALL");
  const [human, setHuman] = useState<Record<string, HumanDecision>>({});
  const [live, setLive] = useState<Record<string, LiveMeta>>({});
  const [running, setRunning] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [byokOpen, setByokOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const storedKeys = useSyncExternalStore(subscribeKeys, readStoredKeys, () => "");
  const keys = useMemo(() => parseKeys(storedKeys), [storedKeys]);

  const records = useMemo(() => evaluateBatch(invoices, rules), [invoices, rules]);
  const statusOf = (record: AuditRecord): DecisionStatus => human[record.invoiceId]?.decision ?? record.finalStatus;
  const autonomous = records.filter((record) => record.finalStatus === "APPROVED" && !human[record.invoiceId]);
  const improper = records.filter((record) => record.finalStatus === "APPROVED" && !record.hardRulesResult.passed);
  const consulted = records.filter((record) => record.jevResult);
  const latency = consulted.length
    ? Math.round(consulted.reduce((sum, record) => sum + (record.jevResult?.latencyMs ?? 0), 0) / consulted.length)
    : 0;
  const consumed = records.reduce((sum, record) => sum + (statusOf(record) === "APPROVED" ? record.totalPayableUsd : 0), 0);
  const retained = records.reduce((sum, record) => sum + (statusOf(record) === "ESCALATED" ? record.totalPayableUsd : 0), 0);
  const available = Math.max(0, Number((rules.monthlyBudgetUsd - consumed - retained).toFixed(2)));
  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedId) ?? invoices[0];
  const selectedRecord = records.find((record) => record.invoiceId === selectedInvoice?.id);

  if (!selectedInvoice || !selectedRecord) {
    return <p className="p-6 text-sm">No hay facturas para evaluar.</p>;
  }
  const activeInvoice = selectedInvoice;
  const activeRecord = selectedRecord;
  const selectedLive = live[activeInvoice.id];

  async function runLive(ids: string[]) {
    setRunning(true);
    setLiveError(null);
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, rules, keys }),
      });
      const body = (await response.json()) as {
        error?: string;
        invoices?: Invoice[];
        results?: Array<{ invoice: Invoice; timings: LayerTiming[]; raw: unknown; explanation: LiveMeta["explanation"] }>;
      };
      if (!response.ok || !body.invoices || !body.results) {
        throw new Error(body.error ?? "La ejecución en vivo no respondió.");
      }
      setInvoices(body.invoices);
      setLive((current) => {
        const next = { ...current };
        for (const result of body.results ?? []) {
          next[result.invoice.id] = {
            timings: result.timings,
            raw: result.raw,
            explanation: result.explanation,
          };
        }
        return next;
      });
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "La ejecución en vivo falló.");
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setRules(DEFAULT_RULES);
    setInvoices(INITIAL_DATASET);
    setHuman({});
    setLive({});
    setSelectedId("INV-01");
    setFilter("ALL");
    setLiveError(null);
    void fetch("/api/webhooks/openclaw", {
      method: "DELETE",
      headers: { "x-openclaw-secret": OPENCLAW_DEMO_SECRET },
    });
  }

  function exportCsv() {
    const exportRecords = records.map((record) => {
      const note = human[record.invoiceId];
      const liveText = live[record.invoiceId]?.explanation.text;
      return {
        ...record,
        finalStatus: statusOf(record),
        explanation: note ? `${liveText || record.explanation} Nota humana: ${note.note}` : liveText || record.explanation,
      };
    });
    const blob = new Blob([recordsToCsv(invoices, exportRecords)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "blinka-guard-conciliacion.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function notifyOpenClaw() {
    await fetch("/api/webhooks/openclaw", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-openclaw-secret": OPENCLAW_DEMO_SECRET,
      },
      body: JSON.stringify({
        kind: "escalation",
        invoiceId: activeInvoice.id,
        payload: {
          totalPayableUsd: activeRecord.totalPayableUsd,
          status: activeRecord.finalStatus,
          explanation: selectedLive?.explanation.text ?? activeRecord.explanation,
        },
      }),
    });
    setDrawerOpen(true);
  }

  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      <Navbar
        running={running}
        onReset={reset}
        onExport={exportCsv}
        onOpenClaw={() => setDrawerOpen(true)}
        onByok={() => setByokOpen(true)}
        onLive={() => void runLive(invoices.map((invoice) => invoice.id))}
      />
      <main className="mx-auto grid max-w-[1440px] gap-4 px-4 py-4">
        <RuleBuilder
          rules={rules}
          autonomy={Math.round((autonomous.length / invoices.length) * 100)}
          autonomousCount={autonomous.length}
          total={invoices.length}
          consumed={consumed}
          retained={retained}
          available={available}
          onChange={(next) => {
            setRules(next);
            setHuman({});
          }}
        />
        <section className="grid gap-3 sm:grid-cols-4">
          <Kpi label="Autonomía operativa" value={`${Math.round((autonomous.length / invoices.length) * 100)}%`} />
          <Kpi label="Pagos indebidos" value={String(improper.length)} />
          <Kpi label="Latencia JEV" value={`${latency} ms`} />
          <Kpi label="Presupuesto disponible" value={usd(available)} />
        </section>
        {liveError ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{liveError}</p> : null}
        <div className="grid items-start gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <InvoiceInbox
            invoices={invoices}
            records={records}
            statusOf={statusOf}
            filter={filter}
            selectedId={activeInvoice.id}
            running={running}
            ranLive={(id) => Boolean(live[id])}
            onFilter={setFilter}
            onSelect={setSelectedId}
            onRerun={(id) => void runLive([id])}
          />
          <AuditInspector
            invoice={activeInvoice}
            record={activeRecord}
            status={statusOf(activeRecord)}
            timings={selectedLive?.timings}
            explanation={
              human[activeInvoice.id]
                ? `${selectedLive?.explanation.text ?? activeRecord.explanation} Nota humana: ${human[activeInvoice.id].note}`
                : selectedLive?.explanation.text ?? activeRecord.explanation
            }
            raw={selectedLive?.raw ?? activeRecord}
            showRaw={showRaw}
            onToggleRaw={() => setShowRaw((value) => !value)}
            onApprove={(note) => setHuman((current) => ({ ...current, [activeInvoice.id]: { decision: "APPROVED", note } }))}
            onReject={(note) => setHuman((current) => ({ ...current, [activeInvoice.id]: { decision: "BLOCKED", note } }))}
            onNotify={() => void notifyOpenClaw()}
          />
        </div>
      </main>
      <ByokModal
        open={byokOpen}
        keys={keys}
        onClose={() => setByokOpen(false)}
        onSave={(next) => {
          window.localStorage.setItem(KEYS_STORAGE, JSON.stringify(next));
          window.dispatchEvent(new Event(KEYS_EVENT));
          setByokOpen(false);
        }}
      />
      <OpenClawDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-[#e6e8ee] bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-[#5c6575]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-[#121826]">{value}</p>
    </article>
  );
}
