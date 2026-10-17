"use client";

import { useSession } from "@/components/session/session-provider";
import { usd } from "@/lib/format";

export function StatsView() {
  const session = useSession();
  const counts = { APPROVED: 0, ESCALATED: 0, BLOCKED: 0 };
  for (const record of session.records) counts[session.statusOf(record)] += 1;
  const total = session.invoices.length;
  const automatic = counts.APPROVED + counts.BLOCKED;
  const autonomy = total ? Math.round((automatic / total) * 100) : 0;
  const bars = [
    { label: "Pagado", value: counts.APPROVED, tone: "approved" },
    { label: "Por revisar", value: counts.ESCALATED, tone: "review" },
    { label: "Rechazado", value: counts.BLOCKED, tone: "blocked" },
  ];

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Estadísticas</h1>
          <p>El trabajo que el agente resuelve por tu equipo.</p>
        </div>
        <span className="badge neutral">Octubre 2026</span>
      </div>
      <section className="efficiency">
        <div>
          <h2>
            {total} facturas, una operación más ágil.
          </h2>
          <p>
            {automatic} de {total} se resuelven sin intervención. Disponible {usd(session.available)}.
          </p>
          <p className="small">La latencia es la media de JEV en los registros que sí lo consultaron.</p>
        </div>
        <div className="efficiency-time">
          <strong>{session.latency > 0 ? `${session.latency} ms` : "—"}</strong>
          <span>media JEV · esta sesión</span>
        </div>
      </section>
      <div className="stats-grid">
        <section>
          <strong>{counts.APPROVED}</strong>
          <h2>Pagos simulados</h2>
          <p>Registrados en el conjunto actual</p>
        </section>
        <section>
          <strong>{session.autonomous.length}</strong>
          <h2>Decisiones automáticas</h2>
          <p>Pagos sin intervención humana</p>
        </section>
        <section>
          <strong>{counts.ESCALATED}</strong>
          <h2>Por revisar</h2>
          <p>Necesitan una decisión humana</p>
        </section>
      </div>
      <section className="panel">
        <h2>Distribución de las facturas</h2>
        {bars.map((bar) => (
          <div key={bar.label} className="stat-bar">
            <span>{bar.label}</span>
            <div>
              <i className={bar.tone} style={{ width: `${total ? (bar.value / total) * 100 : 0}%` }} />
            </div>
            <strong>{bar.value}</strong>
          </div>
        ))}
        <p className="small muted">
          {autonomy}% de las facturas resueltas automáticamente en este conjunto. Pagos indebidos: {session.improper.length}.
        </p>
      </section>
      <p className="page-footer">Los conteos salen del lote en memoria. No hay tiempos ilustrativos.</p>
    </>
  );
}
