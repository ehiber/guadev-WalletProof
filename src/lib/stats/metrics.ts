import type { LayerTiming } from "@/lib/engine/live-pipeline";
import type { AuditRecord, DecisionStatus, Invoice, Project } from "@/types/blinka";

export type StatsPeriod = "7" | "30" | "90";
export type StatsTab = "resumen" | "tecnico" | "comercial";

/** Cifras del prototipo cuando la sesión no guarda esa medición. */
const ILLUSTRATIVE = {
  avgMs: 1420,
  p95Ms: 2180,
  throughputPerMin: 42,
  errorRate: 0.8,
  tokensPerDay: 36400,
  costUsdPerDay: 0.72,
  manualMinutes: 8,
};

export type StatsGroup = { name: string; count: number; amount: number };

export type StatsPoint = {
  label: string;
  count: number;
  latency: number | null;
};

export type FlowStage = {
  label: string;
  ms: number;
  share: number;
};

export type StatsMetrics = {
  count: number;
  paidCount: number;
  review: number;
  rejected: number;
  automatic: number;
  paidUsd: number;
  pendingUsd: number;
  budgetUsd: number;
  availableUsd: number;
  budgetScope: "proyecto" | "empresa";
  byProvider: StatsGroup[];
  byCurrency: StatsGroup[];
  series: StatsPoint[];
  jev: { calls: number; avgMs: number; p95Ms: number; measured: boolean };
  flow: { avgMs: number; p95Ms: number; measured: boolean };
  stages: FlowStage[];
  stagesMeasured: boolean;
  throughputPerMin: number;
  errorRate: number;
  tokens: number;
  costUsd: number;
  savedHours: number;
  manualMinutes: number;
};

type Row = {
  invoice: Invoice;
  record: AuditRecord;
  status: DecisionStatus;
  at: number;
};

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dayLabel(timestamp: number) {
  return new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short" })
    .format(new Date(timestamp))
    .replace(".", "");
}

export function parsePeriod(value: string | null): StatsPeriod {
  return value === "7" || value === "90" ? value : "30";
}

export function parseTab(value: string | null): StatsTab {
  if (value === "tecnico" || value === "technical") return "tecnico";
  if (value === "comercial" || value === "commercial") return "comercial";
  return "resumen";
}

export function periodCutoff(period: StatsPeriod, now = Date.now()) {
  return now - Number(period) * 86_400_000;
}

export function inPeriod(receivedAt: string | undefined, period: StatsPeriod, now = Date.now()) {
  if (!receivedAt) return true;
  const at = new Date(receivedAt).getTime();
  if (Number.isNaN(at)) return true;
  return at >= periodCutoff(period, now);
}

function buildSeries(rows: Row[], period: StatsPeriod, now: number): StatsPoint[] {
  const end = startOfDay(now);
  const span = period === "90" ? 13 : Number(period);
  const width = period === "90" ? 7 : 1;
  return Array.from({ length: span }, (_, index) => {
    const from = end - (span - 1 - index) * width * 86_400_000;
    const to = from + width * 86_400_000;
    const bucket = rows.filter((row) => row.at >= from && row.at < to);
    const latencies = bucket
      .map((row) => row.record.jevResult?.latencyMs)
      .filter((value): value is number => typeof value === "number");
    return {
      label: period === "90" ? `S${index + 1}` : dayLabel(from),
      count: bucket.length,
      latency: latencies.length ? Math.round(mean(latencies)) : null,
    };
  });
}

export function buildStats(input: {
  invoices: Invoice[];
  records: AuditRecord[];
  statusOf: (record: AuditRecord) => DecisionStatus;
  human: Record<string, unknown>;
  timings: Record<string, LayerTiming[] | undefined>;
  projects: Project[];
  companyBudgetUsd: number;
  projectId: string;
  period: StatsPeriod;
  now?: number;
}): StatsMetrics {
  const now = input.now ?? Date.now();
  const byId = new Map(input.records.map((record) => [record.invoiceId, record]));
  const allRows: Row[] = [];
  for (const invoice of input.invoices) {
    const record = byId.get(invoice.id);
    if (!record) continue;
    const at = new Date(invoice.receivedAt ?? "").getTime();
    allRows.push({
      invoice,
      record,
      status: input.statusOf(record),
      at: Number.isNaN(at) ? now : at,
    });
  }
  const cutoff = periodCutoff(input.period, now);
  const inWindow = (row: Row) => !row.invoice.receivedAt || row.at >= cutoff;
  const companyRows = allRows.filter(inWindow);
  const rows =
    input.projectId === "all" ? companyRows : companyRows.filter((row) => row.invoice.projectId === input.projectId);
  const paid = rows.filter((row) => row.status === "APPROVED");
  const review = rows.filter((row) => row.status === "ESCALATED");
  const rejected = rows.filter((row) => row.status === "BLOCKED");
  const automatic = rows.filter((row) => !input.human[row.invoice.id] && row.status !== "ESCALATED");
  const paidUsd = Number(paid.reduce((sum, row) => sum + row.record.totalPayableUsd, 0).toFixed(2));
  const pendingUsd = Number(review.reduce((sum, row) => sum + row.record.totalPayableUsd, 0).toFixed(2));
  const project = input.projects.find((item) => item.id === input.projectId);
  const ownBudget = input.projectId !== "all" ? project?.rules.monthlyBudgetUsd : undefined;
  const budgetUsd = ownBudget ?? input.companyBudgetUsd;
  const jevLatencies = rows
    .map((row) => row.record.jevResult?.latencyMs)
    .filter((value): value is number => typeof value === "number");
  const flowTotals = rows
    .map((row) => input.timings[row.invoice.id])
    .filter((layers): layers is LayerTiming[] => Boolean(layers?.length))
    .map((layers) => layers.reduce((sum, layer) => sum + layer.ms, 0));
  const flowMeasured = flowTotals.length > 0;
  const jevMeasured = jevLatencies.length > 0;
  const avgFlow = flowMeasured ? Math.round(mean(flowTotals)) : ILLUSTRATIVE.avgMs;
  const jevAvg = jevMeasured ? Math.round(mean(jevLatencies)) : Math.round(avgFlow * 0.18);
  const factor =
    input.projectId === "all"
      ? 1
      : Math.min(1, Math.max(0.22, rows.length / Math.max(companyRows.length, 1)));
  const days = Number(input.period);
  const layerOrder: Array<{ layer: LayerTiming["layer"]; label: string; fallback: number }> = [
    { layer: "extract", label: "Lectura y extracción", fallback: 0.42 },
    { layer: "jev", label: "Análisis JEV", fallback: jevAvg / Math.max(1, avgFlow) },
    { layer: "rules", label: "Evaluación de criterios", fallback: 0.25 },
    {
      layer: "explain",
      label: "Registro y respuesta",
      fallback: 0.33 - jevAvg / Math.max(1, avgFlow),
    },
  ];
  const measuredLayers = rows
    .map((row) => input.timings[row.invoice.id])
    .filter((layers): layers is LayerTiming[] => Boolean(layers?.length));
  const stagesMeasured = measuredLayers.length > 0;
  const stages = layerOrder.map((item) => {
    if (!stagesMeasured) {
      return { label: item.label, ms: Math.round(avgFlow * item.fallback), share: item.fallback };
    }
    const samples = measuredLayers
      .map((layers) => layers.find((layer) => layer.layer === item.layer)?.ms)
      .filter((value): value is number => typeof value === "number");
    const ms = samples.length ? Math.round(mean(samples)) : 0;
    return { label: item.label, ms, share: 0 };
  });
  if (stagesMeasured) {
    const total = stages.reduce((sum, stage) => sum + stage.ms, 0) || 1;
    for (const stage of stages) stage.share = stage.ms / total;
  }
  const grouping = (key: (row: Row) => string): StatsGroup[] => {
    const map = new Map<string, StatsGroup>();
    for (const row of rows) {
      const name = key(row);
      const current = map.get(name) ?? { name, count: 0, amount: 0 };
      current.count += 1;
      current.amount = Number((current.amount + row.record.totalPayableUsd).toFixed(2));
      map.set(name, current);
    }
    return [...map.values()].sort((left, right) => right.count - left.count || right.amount - left.amount);
  };

  return {
    count: rows.length,
    paidCount: paid.length,
    review: review.length,
    rejected: rejected.length,
    automatic: automatic.length,
    paidUsd,
    pendingUsd,
    budgetUsd,
    availableUsd: Math.max(0, Number((budgetUsd - paidUsd - pendingUsd).toFixed(2))),
    budgetScope: ownBudget === undefined ? "empresa" : "proyecto",
    byProvider: grouping((row) => row.invoice.vendorName),
    byCurrency: grouping((row) => row.invoice.currency),
    series: buildSeries(rows, input.period, now),
    jev: {
      calls: jevLatencies.length,
      avgMs: jevAvg,
      p95Ms: jevMeasured ? Math.round(percentile(jevLatencies, 0.95)) : Math.round(ILLUSTRATIVE.p95Ms * 0.18),
      measured: jevMeasured,
    },
    flow: {
      avgMs: avgFlow,
      p95Ms: flowMeasured ? Math.round(percentile(flowTotals, 0.95)) : ILLUSTRATIVE.p95Ms,
      measured: flowMeasured,
    },
    stages,
    stagesMeasured,
    throughputPerMin: ILLUSTRATIVE.throughputPerMin,
    errorRate: ILLUSTRATIVE.errorRate,
    tokens: Math.round(days * ILLUSTRATIVE.tokensPerDay * factor),
    costUsd: Number((days * ILLUSTRATIVE.costUsdPerDay * factor).toFixed(2)),
    savedHours: Number(((automatic.length * ILLUSTRATIVE.manualMinutes) / 60).toFixed(1)),
    manualMinutes: ILLUSTRATIVE.manualMinutes,
  };
}
