"use client";

import { fxTickerRates } from "@/lib/mock-data/fx-ledger";
import { usd } from "@/lib/format";
import type { CompanyRules } from "@/types/blinka";

export function RuleBuilder({
  rules,
  autonomy,
  autonomousCount,
  total,
  consumed,
  retained,
  available,
  onChange,
}: {
  rules: CompanyRules;
  autonomy: number;
  autonomousCount: number;
  total: number;
  consumed: number;
  retained: number;
  available: number;
  onChange: (rules: CompanyRules) => void;
}) {
  const budget = rules.monthlyBudgetUsd;
  const consumedPct = Math.min(100, (consumed / budget) * 100);
  const retainedPct = Math.min(100 - consumedPct, (retained / budget) * 100);
  const rates = fxTickerRates();

  return (
    <section className="grid gap-4 rounded-xl border border-[#e6e8ee] bg-white p-4 lg:grid-cols-[1.4fr_0.8fr]">
      <div className="grid gap-4 sm:grid-cols-3">
        <Slider
          label="Límite automático"
          min={100}
          max={2000}
          step={10}
          value={rules.maxAutoApproveUsd}
          display={usd(rules.maxAutoApproveUsd)}
          onChange={(maxAutoApproveUsd) => onChange({ ...rules, maxAutoApproveUsd })}
        />
        <Slider
          label="Presupuesto del periodo"
          min={1000}
          max={10000}
          step={100}
          value={rules.monthlyBudgetUsd}
          display={usd(rules.monthlyBudgetUsd)}
          onChange={(monthlyBudgetUsd) => onChange({ ...rules, monthlyBudgetUsd })}
        />
        <Slider
          label="Confianza JEV"
          min={50}
          max={99}
          step={1}
          value={Math.round(rules.jevConfidenceThreshold * 100)}
          display={`${Math.round(rules.jevConfidenceThreshold * 100)}%`}
          onChange={(percent) => onChange({ ...rules, jevConfidenceThreshold: percent / 100 })}
        />
      </div>
      <div className="flex flex-col justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[#5c6575]">What-if</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-[#121826]">{autonomy}% autonomía</p>
          <p className="text-sm text-[#5c6575]">
            {autonomousCount} de {total} se pagan solas. 0 pagos fuera de regla.
          </p>
        </div>
        <div>
          <div className="flex h-2 overflow-hidden rounded-full bg-[#eef0f4]">
            <span className="bg-emerald-600" style={{ width: `${consumedPct}%` }} />
            <span className="bg-amber-400" style={{ width: `${retainedPct}%` }} />
          </div>
          <p className="mt-2 text-xs text-[#5c6575]">
            Consumido {usd(consumed)} · Retenido {usd(retained)} · Disponible {usd(available)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {rates.map((rate) => (
            <span key={rate.currency} className="rounded-full bg-[#f4f6f8] px-2.5 py-1 text-xs text-[#121826]">
              USD/{rate.currency} {rate.rateToUsd.toLocaleString("en-US")}
            </span>
          ))}
        </div>
      </div>
    </section>
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
    <label className="block">
      <span className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-[#5c6575]">{label}</span>
        <span className="font-medium tabular-nums text-[#121826]">{display}</span>
      </span>
      <input
        className="mt-2 w-full accent-[#121826]"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
