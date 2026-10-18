"use client";

import { useSession } from "@/components/session/session-provider";
import { usd } from "@/lib/format";
import {
  buildStats,
  parsePeriod,
  parseTab,
  type StatsGroup,
  type StatsMetrics,
  type StatsPeriod,
  type StatsPoint,
  type StatsTab,
} from "@/lib/stats/metrics";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const TABS: Array<{ id: StatsTab; label: string }> = [
  { id: "resumen", label: "Resumen" },
  { id: "tecnico", label: "Rendimiento del sistema" },
  { id: "comercial", label: "Control comercial" },
];

const PERIODS: StatsPeriod[] = ["7", "30", "90"];

function num(value: number, digits = 0) {
  return Number(value || 0).toLocaleString("es-VE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function origin(measured: boolean, text: string) {
  return measured ? text : `Ilustrativo · ${text}`;
}

function Kpi({ label, value, note, highlight = false }: { label: string; value: string; note: string; highlight?: boolean }) {
  return (
    <article className={highlight ? "st-kpi st-highlight" : "st-kpi"}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function LineChart({
  series,
  title,
  unit,
  field,
  illustrative,
}: {
  series: StatsPoint[];
  title: string;
  unit: string;
  field: "count" | "latency";
  illustrative: boolean;
}) {
  const measuredValues = series
    .map((point) => (field === "count" ? point.count : point.latency))
    .filter((value): value is number => value !== null);
  const measured = field === "count" || measuredValues.length > 0;
  const max = Math.max(...(measuredValues.length ? measuredValues : [0]), 1);
  const width = 680;
  const height = 170;
  const xAt = (index: number) => 48 + (index * (width - 64)) / Math.max(series.length - 1, 1);
  const yAt = (value: number) => height - (value / max) * (height - 28);
  const segments: string[] = [];
  let current: string[] = [];
  series.forEach((point, index) => {
    const value = field === "count" ? point.count : point.latency;
    if (value === null) {
      if (current.length) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${xAt(index)},${yAt(value)}`);
  });
  if (current.length) segments.push(current.join(" "));
  const area = segments[0] ? `48,170 ${segments[0]} ${segments[0].split(" ").at(-1)?.split(",")[0] ?? 48},170` : "";
  return (
    <figure className="st-chart">
      <figcaption>
        {title}{" "}
        <span>
          {unit} · {illustrative || !measured ? "Serie ilustrativa" : "Serie del conjunto local"}
        </span>
      </figcaption>
      {field === "latency" && !measured ? (
        <p className="st-empty">No hay latencia medida en este periodo.</p>
      ) : (
        <svg viewBox="0 0 700 220" role="img" aria-label={`${title}. ${series.length} puntos.`}>
          {[0, 0.5, 1].map((mark) => (
            <g key={mark}>
              <line x1="48" x2={width} y1={yAt(max * mark)} y2={yAt(max * mark)} stroke="var(--line)" strokeDasharray="4 5" />
              <text x="38" y={yAt(max * mark) + 4} textAnchor="end">
                {num(max * mark)}
              </text>
            </g>
          ))}
          {field === "count" ? <polygon points={area} fill="var(--accent)" opacity="0.07" /> : null}
          {segments.map((segment, index) => (
            <polyline key={index} points={segment} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {series.map((point, index) =>
            index === 0 || index === series.length - 1 || index === Math.floor(series.length / 2) ? (
              <text
                key={point.label}
                x={xAt(index)}
                y="201"
                textAnchor={index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"}
              >
                {point.label}
              </text>
            ) : null,
          )}
        </svg>
      )}
      <details>
        <summary>Ver valores del gráfico</summary>
        <div className="st-data">
          {series.map((point, index) => (
            <span key={`${point.label}-${index}`}>
              {point.label}{" "}
              <b>
                {field === "latency" && point.latency === null ? "—" : `${num(field === "count" ? point.count : point.latency ?? 0)} ${unit}`}
              </b>
            </span>
          ))}
        </div>
      </details>
    </figure>
  );
}

function Bars({ items }: { items: StatsGroup[] }) {
  if (items.length === 0) return <p className="st-empty">No hay facturas para este filtro.</p>;
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <div className="st-bars">
      {items.map((item) => (
        <div key={item.name}>
          <div className="st-bar-label">
            <strong>{item.name}</strong>
            <span>
              {num(item.count)} {item.count === 1 ? "factura" : "facturas"}
            </span>
          </div>
          <div className="st-track">
            <span style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
          <small>Importe normalizado: {usd(item.amount)}</small>
        </div>
      ))}
    </div>
  );
}

function IllustrativeNote() {
  return (
    <p className="st-illustrative">
      <strong>Datos ilustrativos de rendimiento.</strong> Estas cifras muestran cómo se supervisaría el sistema. No representan
      mediciones de la aplicación ni un ahorro validado.
    </p>
  );
}

export function StatsView() {
  const session = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("proyecto") ?? "all";
  const project = requested === "all" || session.projects.some((item) => item.id === requested) ? requested : "all";
  const period = parsePeriod(params.get("periodo"));
  const tab = parseTab(params.get("tab"));
  const metrics = buildStats({
    invoices: session.invoices,
    records: session.records,
    statusOf: session.statusOf,
    human: session.human,
    timings: Object.fromEntries(Object.entries(session.live).map(([id, meta]) => [id, meta.timings])),
    projects: session.projects,
    companyBudgetUsd: session.rules.monthlyBudgetUsd,
    projectId: project,
    period,
  });
  const scope = project === "all" ? "Toda la empresa" : (session.projects.find((item) => item.id === project)?.name ?? "Toda la empresa");
  const title =
    tab === "tecnico" ? "Rendimiento del sistema" : tab === "comercial" ? "Control comercial" : "Resumen de actividad";

  function href(next: { proyecto?: string; periodo?: StatsPeriod; tab?: StatsTab }) {
    const query = new URLSearchParams();
    const nextProject = next.proyecto ?? project;
    const nextPeriod = next.periodo ?? period;
    const nextTab = next.tab ?? tab;
    if (nextProject !== "all") query.set("proyecto", nextProject);
    if (nextPeriod !== "30") query.set("periodo", nextPeriod);
    if (nextTab === "tecnico") query.set("tab", "tecnico");
    if (nextTab === "comercial") query.set("tab", "comercial");
    const value = query.toString();
    return value ? `/estadisticas?${value}` : "/estadisticas";
  }

  function go(next: { proyecto?: string; periodo?: StatsPeriod; tab?: StatsTab }) {
    router.replace(href(next));
  }

  function inboxHref(estado?: "pagado" | "revision" | "rechazado") {
    const query = new URLSearchParams();
    if (project === "all") query.set("alcance", "todos");
    else query.set("proyecto", project);
    query.set("periodo", period);
    if (estado) query.set("estado", estado);
    return `/?${query.toString()}`;
  }

  return (
    <div className="st-page">
      <header className="page-heading">
        <div>
          <h1>Estadísticas</h1>
          <p>Actividad, presupuesto y rendimiento de tus operaciones.</p>
        </div>
        <Link className="btn primary" href={inboxHref()}>
          Ver facturas
        </Link>
      </header>
      <div className="st-filters">
        <label htmlFor="st-project">
          Proyecto
          <select id="st-project" value={project} onChange={(event) => go({ proyecto: event.target.value })}>
            <option value="all">Toda la empresa</option>
            {session.projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.status === "archived" ? " · Archivado" : ""}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Periodo</legend>
          {PERIODS.map((item) => (
            <button
              key={item}
              className="st-period"
              type="button"
              aria-pressed={item === period}
              onClick={() => go({ periodo: item })}
            >
              {item} días
            </button>
          ))}
        </fieldset>
        <span className="st-scope">
          {scope}
          {project !== "all" ? (
            <Link href={`/proyectos/${project}`}>Ver proyecto →</Link>
          ) : null}
        </span>
      </div>
      <nav className="st-tabs" aria-label="Secciones de estadísticas">
        {TABS.map((item) => (
          <Link key={item.id} href={href({ tab: item.id })} aria-current={tab === item.id ? "page" : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>
      <h2 className="st-view-title">{title}</h2>
      {metrics.count === 0 ? (
        <div className="st-empty-panel">
          <strong>No hay facturas en este periodo.</strong>
          <p>Cambia el proyecto o amplía el periodo para consultar actividad.</p>
          <button className="btn" type="button" onClick={() => go({ proyecto: "all", periodo: "90", tab })}>
            Ver toda la empresa · 90 días
          </button>
        </div>
      ) : null}
      {tab === "tecnico" ? <Technical metrics={metrics} /> : null}
      {tab === "comercial" ? <Commercial metrics={metrics} project={project} period={period} inboxHref={inboxHref} /> : null}
      {tab === "resumen" ? <Summary metrics={metrics} period={period} inboxHref={inboxHref} technicalHref={href({ tab: "tecnico" })} /> : null}
      <p className="page-footer">Los conteos salen del lote en memoria. Lo marcado como ilustrativo no es una medición de esta sesión.</p>
    </div>
  );
}

function Source({ period }: { period: StatsPeriod }) {
  return (
    <div className="st-source">
      <span className="st-source-dot" />
      Conteos e importes del conjunto local · Últimos {period} días · Pagos simulados
    </div>
  );
}

function ActivityKpis({ metrics }: { metrics: StatsMetrics }) {
  const auto = metrics.count ? (metrics.automatic / metrics.count) * 100 : 0;
  return (
    <div className="st-kpis">
      <Kpi label="Facturas evaluadas" value={num(metrics.count)} note="Conjunto local del periodo" />
      <Kpi
        label="Decisiones automáticas"
        value={`${num(auto, 1)}%`}
        note={`${num(metrics.automatic)} de ${num(metrics.count)} facturas`}
        highlight
      />
      <Kpi label="Por revisar" value={num(metrics.review)} note="Requieren atención de Finanzas" />
      <Kpi label="Importe pagado" value={usd(metrics.paidUsd)} note="USD · Pago simulado" />
    </div>
  );
}

function Distribution({ metrics, inboxHref }: { metrics: StatsMetrics; inboxHref: (estado?: "pagado" | "revision" | "rechazado") => string }) {
  const shares = [metrics.paidCount, metrics.review, metrics.rejected].map((value) => (metrics.count ? (value / metrics.count) * 100 : 0));
  const rows: Array<{ name: string; value: number; color: string; estado: "pagado" | "revision" | "rechazado" }> = [
    { name: "Pagado", value: metrics.paidCount, color: "#2a4bd0", estado: "pagado" },
    { name: "Por revisar", value: metrics.review, color: "#a57925", estado: "revision" },
    { name: "Rechazado", value: metrics.rejected, color: "#a03f37", estado: "rechazado" },
  ];
  return (
    <article className="panel st-panel">
      <div className="st-panel-head">
        <h2>Resultado de las facturas</h2>
        <span>Conjunto local</span>
      </div>
      <div
        className="st-distribution"
        role="img"
        aria-label={`${metrics.paidCount} pagadas, ${metrics.review} por revisar, ${metrics.rejected} rechazadas`}
      >
        <span style={{ width: `${shares[0]}%`, background: "var(--accent)" }} />
        <span style={{ width: `${shares[1]}%`, background: "#a57925" }} />
        <span style={{ width: `${shares[2]}%`, background: "var(--danger)" }} />
      </div>
      <div className="st-state-list">
        {rows.map((row) => (
          <Link key={row.name} href={inboxHref(row.estado)}>
            <i style={{ background: row.color }} />
            <span>{row.name}</span>
            <strong>{num(row.value)}</strong>
            <small>{metrics.count ? num((row.value / metrics.count) * 100, 1) : 0}%</small>
          </Link>
        ))}
      </div>
    </article>
  );
}

function Budget({ metrics }: { metrics: StatsMetrics }) {
  const used = Math.min(100, (metrics.paidUsd / Math.max(1, metrics.budgetUsd)) * 100);
  return (
    <article className="panel st-panel">
      <div className="st-panel-head">
        <h2>Presupuesto vigente</h2>
        <span>USD · Periodo configurado</span>
      </div>
      <strong className="st-amount">{usd(metrics.availableUsd)}</strong>
      <p className="muted">Disponible en {metrics.budgetScope === "proyecto" ? "el proyecto" : "la empresa"}</p>
      <div className="st-budget-track">
        <span style={{ width: `${used}%` }} />
      </div>
      <dl className="st-budget-detail">
        <div>
          <dt>Presupuesto</dt>
          <dd>{usd(metrics.budgetUsd)}</dd>
        </div>
        <div>
          <dt>Pagado</dt>
          <dd>{usd(metrics.paidUsd)}</dd>
        </div>
        <div>
          <dt>Por revisar</dt>
          <dd>{usd(metrics.pendingUsd)}</dd>
        </div>
      </dl>
      <small className="muted">
        El presupuesto pertenece al periodo configurado {metrics.budgetScope === "proyecto" ? "del proyecto" : "de la empresa"}; el
        filtro superior selecciona la actividad.
      </small>
    </article>
  );
}

function Summary({
  metrics,
  period,
  inboxHref,
  technicalHref,
}: {
  metrics: StatsMetrics;
  period: StatsPeriod;
  inboxHref: (estado?: "pagado" | "revision" | "rechazado") => string;
  technicalHref: string;
}) {
  return (
    <>
      <Source period={period} />
      <ActivityKpis metrics={metrics} />
      <div className="st-grid">
        <article className="panel st-panel">
          <LineChart series={metrics.series} title="Ritmo de evaluación" unit="facturas" field="count" illustrative={false} />
          <p className="st-subtext">Evolución del conjunto local para ver en qué días se concentró el trabajo.</p>
        </article>
        <Distribution metrics={metrics} inboxHref={inboxHref} />
      </div>
      <div className="st-grid">
        <Budget metrics={metrics} />
        <article className="panel st-panel st-focus">
          <span className="st-eyebrow">EFICIENCIA OPERATIVA</span>
          <h2>
            Menos comprobaciones repetidas.
            <br />
            Más atención a las excepciones.
          </h2>
          <p>
            {num(metrics.automatic)} decisiones del conjunto local se resolvieron automáticamente. {num(metrics.review)} facturas
            necesitan revisión humana.
          </p>
          <div className="st-button-row">
            <Link className="btn primary" href={inboxHref("revision")}>
              Revisar pendientes
            </Link>
            <Link className="btn" href={technicalHref}>
              Ver rendimiento del sistema
            </Link>
          </div>
        </article>
      </div>
      <IllustrativeNote />
      <div className="st-kpis">
        <Kpi
          label="Promedio total"
          value={`${num(metrics.flow.avgMs)} ms`}
          note={origin(metrics.flow.measured, "Lectura, análisis, criterios y registro")}
        />
        <Kpi
          label="Latencia JEV"
          value={`${num(metrics.jev.avgMs)} ms`}
          note={origin(metrics.jev.measured, "Etapa semántica; no es el tiempo total")}
        />
        <Kpi label="Capacidad" value={`${num(metrics.throughputPerMin, 1)}/min`} note="Ilustrativo · Facturas por minuto" />
        <Kpi
          label="Tiempo potencial recuperado"
          value={`${num(metrics.savedHours, 1)} h`}
          note={`Estimación · ${num(metrics.automatic)} facturas × ${num(metrics.manualMinutes)} min`}
        />
      </div>
    </>
  );
}

function Technical({ metrics }: { metrics: StatsMetrics }) {
  const perCall = metrics.jev.calls ? metrics.costUsd / metrics.jev.calls : 0;
  return (
    <>
      <IllustrativeNote />
      <div className="st-kpis">
        <Kpi
          label="Tiempo total promedio"
          value={`${num(metrics.flow.avgMs)} ms`}
          note={origin(metrics.flow.measured, "Flujo completo")}
          highlight
        />
        <Kpi
          label="Latencia p95"
          value={`${num(metrics.flow.p95Ms)} ms`}
          note={origin(metrics.flow.measured, "95% de operaciones por debajo")}
        />
        <Kpi label="Capacidad de procesamiento" value={`${num(metrics.throughputPerMin, 1)}/min`} note="Ilustrativo · Facturas por minuto" />
        <Kpi label="Errores de procesamiento" value={`${num(metrics.errorRate, 2)}%`} note="Ilustrativo · Errores técnicos" />
      </div>
      <div className="st-grid">
        <article className="panel st-panel">
          <LineChart
            series={metrics.series}
            title="Tiempo de procesamiento"
            unit="ms"
            field="latency"
            illustrative={!metrics.series.some((point) => point.latency !== null)}
          />
        </article>
        <article className="panel st-panel">
          <div className="st-panel-head">
            <h2>Tiempo por etapa</h2>
            <span>{metrics.stagesMeasured ? "Medido en ejecuciones en vivo" : "Distribución ilustrativa"}</span>
          </div>
          <p className="st-subtext">Desglose del promedio total; el análisis JEV es solo una etapa.</p>
          <div className="st-stages">
            {metrics.stages.map((stage) => (
              <div key={stage.label}>
                <span>{stage.label}</span>
                <strong>{num(stage.ms)} ms</strong>
                <div className="st-track">
                  <span style={{ width: `${Math.max(0, stage.share) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
      <div className="st-grid st-three">
        <article className="panel st-panel">
          <h2>Consultas a JEV</h2>
          <strong className="st-amount">{num(metrics.jev.calls)}</strong>
          <p className="muted">{metrics.jev.measured ? "Llamadas registradas en el lote." : "Sin consultas JEV en este periodo."}</p>
          <dl className="st-budget-detail">
            <div>
              <dt>Latencia promedio de JEV</dt>
              <dd>
                {num(metrics.jev.avgMs)} ms{metrics.jev.measured ? "" : " · ilustrativa"}
              </dd>
            </div>
            <div>
              <dt>Tiempo total del flujo</dt>
              <dd>
                {num(metrics.flow.avgMs)} ms{metrics.flow.measured ? "" : " · ilustrativo"}
              </dd>
            </div>
          </dl>
        </article>
        <article className="panel st-panel">
          <h2>Recursos de IA</h2>
          <strong className="st-amount">{num(metrics.tokens)}</strong>
          <p className="muted">Tokens estimados · Ilustrativo</p>
          <dl className="st-budget-detail">
            <div>
              <dt>Coste estimado</dt>
              <dd>USD {num(metrics.costUsd, 3)} · ilustrativo</dd>
            </div>
            <div>
              <dt>Por consulta ilustrativa</dt>
              <dd>USD {num(perCall, 4)}</dd>
            </div>
          </dl>
        </article>
        <article className="panel st-panel st-opportunity">
          <h2>Trabajo repetitivo evitado</h2>
          <strong className="st-amount">{num(metrics.savedHours, 1)} h</strong>
          <p>Estimación del tiempo que Finanzas podría dedicar a excepciones, a partir de las facturas automáticas del periodo.</p>
          <small>
            {num(metrics.automatic)} facturas automáticas. Supuesto: {num(metrics.manualMinutes)} minutos manuales por factura. No es
            una medición del trabajo real del equipo.
          </small>
        </article>
      </div>
    </>
  );
}

function Commercial({
  metrics,
  project,
  period,
  inboxHref,
}: {
  metrics: StatsMetrics;
  project: string;
  period: StatsPeriod;
  inboxHref: (estado?: "pagado" | "revision" | "rechazado") => string;
}) {
  const providers = project === "all" ? "/proveedores" : `/proveedores?proyecto=${encodeURIComponent(project)}`;
  return (
    <>
      <Source period={period} />
      <ActivityKpis metrics={metrics} />
      <div className="st-grid">
        <Budget metrics={metrics} />
        <Distribution metrics={metrics} inboxHref={inboxHref} />
      </div>
      <div className="st-grid">
        <article className="panel st-panel">
          <div className="st-panel-head">
            <h2>Actividad por proveedor</h2>
            <Link href={providers}>Ver proveedores →</Link>
          </div>
          <Bars items={metrics.byProvider} />
        </article>
        <article className="panel st-panel">
          <div className="st-panel-head">
            <h2>Actividad por moneda</h2>
            <span>Importes equivalentes en USD</span>
          </div>
          <Bars items={metrics.byCurrency} />
        </article>
      </div>
    </>
  );
}
