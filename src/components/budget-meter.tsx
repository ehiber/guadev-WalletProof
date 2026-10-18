import { usd } from "@/lib/format";

export function purse(paid: number, retained: number, total: number) {
  const base = total > 0 ? total : 1;
  let paidPct = (paid / base) * 100;
  let retainedPct = (retained / base) * 100;
  if (paidPct + retainedPct > 100) {
    const scale = 100 / (paidPct + retainedPct);
    paidPct *= scale;
    retainedPct *= scale;
  }
  return {
    paid,
    retained,
    total,
    available: Math.max(0, Number((total - paid - retained).toFixed(2))),
    paidPct,
    retainedPct,
  };
}

export function BudgetMeter({
  label,
  paid,
  retained,
  total,
  available,
  paidPct,
  retainedPct,
}: {
  label: string;
  paid: number;
  retained: number;
  total: number;
  available: number;
  paidPct: number;
  retainedPct: number;
}) {
  return (
    <div className="budget-block">
      <div className="budget-head">
        <span>{label}</span>
        <strong>
          {usd(available)} <span className="small">USD</span>
        </strong>
      </div>
      <div
        className="budget-bar"
        role="img"
        aria-label={`Presupuesto ${usd(total)}, pagado ${usd(paid)}, retenido ${usd(retained)}, disponible ${usd(available)}`}
      >
        <span className="budget-approved" style={{ width: `${paidPct}%` }} />
        <span className="budget-retained" style={{ width: `${retainedPct}%` }} />
      </div>
      <div className="budget-legend">
        <span>
          <i className="budget-dot paid" aria-hidden="true" /> Pagado <span className="budget-figure">{usd(paid)}</span>
        </span>
        <span>
          <i className="budget-dot retained" aria-hidden="true" /> Retenido <span className="budget-figure">{usd(retained)}</span>
        </span>
        <span className="budget-total">
          Total <span className="budget-figure">{usd(total)}</span>
        </span>
      </div>
      <p className="budget-note">Lo retenido está reservado para facturas por revisar.</p>
    </div>
  );
}
