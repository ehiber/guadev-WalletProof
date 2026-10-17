"use client";

import { useSession } from "@/components/session/session-provider";
import { usd } from "@/lib/format";

export function StatsView() {
  const session = useSession();
  const counts = { APPROVED: 0, ESCALATED: 0, BLOCKED: 0 };
  for (const record of session.records) counts[session.statusOf(record)] += 1;
  const autonomy = session.invoices.length ? Math.round((session.autonomous.length / session.invoices.length) * 100) : 0;
  return (
    <div>
      <h1 className="text-[32px] leading-tight font-semibold tracking-tight">Estadísticas</h1>
      <p className="mt-2 mb-7 max-w-[72ch] text-[13px] text-muted">
        Conteos de esta sesión. La latencia es la media de JEV en los records que sí lo consultaron, no un tiempo ilustrativo.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Autonomía operativa" value={`${autonomy}%`} detail={`${session.autonomous.length} de ${session.invoices.length} se pagan solas`} />
        <Stat label="Pagos indebidos" value={String(session.improper.length)} detail="Aprobados con una regla dura en fallo" />
        <Stat label="Latencia JEV" value={`${session.latency} ms`} detail="Media de los snapshots o de la ejecución en vivo" />
        <Stat label="Disponible" value={usd(session.available)} detail={`Consumido ${usd(session.consumed)} · Retenido ${usd(session.retained)}`} />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Pagado" value={String(counts.APPROVED)} detail="Veredicto APPROVED" />
        <Stat label="Por revisar" value={String(counts.ESCALATED)} detail="Veredicto ESCALATED" />
        <Stat label="Rechazado" value={String(counts.BLOCKED)} detail="Veredicto BLOCKED" />
      </div>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-xl border border-line bg-surface px-4 py-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] text-muted">{detail}</p>
    </article>
  );
}
