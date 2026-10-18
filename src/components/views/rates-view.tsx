"use client";

import { useSession } from "@/components/session/session-provider";
import { fxRate, usd, vendorDisplay } from "@/lib/format";
import { fxScopeLabel, isModifiedRate, type FxOverride, type FxScope } from "@/lib/engine/fx-overrides";
import { CRYPTO_CODES, DEMO_ISSUE_DATE, FIAT_CODES, USDC_NETWORKS, fxTickerRates, paymentDate } from "@/lib/mock-data/fx-ledger";
import type { FxRate } from "@/types/blinka";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

export function RatesView() {
  const session = useSession();
  const rates = fxTickerRates();
  const fiat = rates.filter((rate) => (FIAT_CODES as readonly string[]).includes(rate.currency));
  const crypto = rates.filter((rate) => (CRYPTO_CODES as readonly string[]).includes(rate.currency));
  const used = session.records.filter((record) => record.fxSnapshot);

  function quoteFor(currency: string): number | null {
    const quote = session.fxMarket.find((item) => item.currency === currency);
    return quote && quote.rateToUsd > 0 ? quote.rateToUsd : null;
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Tasas de cambio</h1>
          <p>1 USD equivale al valor mostrado.</p>
        </div>
        <button className="btn" type="button" disabled={session.fxBusy} onClick={() => void session.refreshFx()}>
          <RefreshCw className="icon" /> {session.fxBusy ? "Consultando…" : "Consultar referencia del día"}
        </button>
      </div>
      {session.fxError ? (
        <div className="notice error">
          <p>{session.fxError}</p>
        </div>
      ) : null}
      <RateStrip title="Monedas" rates={fiat} quoteFor={quoteFor} busy={session.fxBusy} asOf={session.fxMarket[0]?.date} overrides={session.fxOverrides} />
      <RateStrip title="Criptomonedas" rates={crypto} quoteFor={quoteFor} busy={session.fxBusy} asOf={session.fxMarket[0]?.date} overrides={session.fxOverrides} crypto />
      <RateEditor />
      <section className="panel">
        <h2>Conversiones del lote</h2>
        <p>Cada fila muestra el total original, la tasa aplicada y el USD del registro.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Factura</th>
                <th scope="col">Original</th>
                <th scope="col">Tasa</th>
                <th scope="col">USD</th>
              </tr>
            </thead>
            <tbody>
              {used.map((record) => {
                const invoice = session.invoices.find((item) => item.id === record.invoiceId);
                if (!invoice || !record.fxSnapshot) return null;
                return (
                  <tr key={record.invoiceId}>
                    <td>
                      <Link href={`/facturas/${invoice.id}`}>{invoice.id}</Link>
                    </td>
                    <td>
                      {invoice.totalPayable} {invoice.currency}
                    </td>
                    <td>
                      {fxRate(record.fxSnapshot.rateToUsd)}
                      {isModifiedRate(record.fxSnapshot.source) ? <small>Tasa modificada</small> : null}
                    </td>
                    <td className="money">{usd(record.totalPayableUsd)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <p className="page-footer">
        USDC vale lo mismo en {USDC_NETWORKS.join(", ")}. La tasa es la del día de pago. Si falta, lo decide la regla de tasa.
      </p>
    </>
  );
}

function RateStrip({
  title,
  rates,
  quoteFor,
  busy,
  asOf,
  overrides,
  crypto = false,
}: {
  title: string;
  rates: FxRate[];
  quoteFor: (currency: string) => number | null;
  busy: boolean;
  asOf?: string;
  overrides: FxOverride[];
  crypto?: boolean;
}) {
  return (
    <section className="fx-strip" aria-label={title}>
      <div className="section-heading">
        <h2>{title}</h2>
        <span className="small muted">{asOf ? `Hoy ${asOf}` : "Referencia de hoy"}</span>
      </div>
      <div className="fx-grid">
        {rates.map((rate) => {
          const modified = [...overrides].reverse().find((item) => item.scope === "day" && item.currency === rate.currency);
          const quote = quoteFor(rate.currency);
          const shown = modified?.rateToUsd ?? quote;
          return (
            <article key={rate.currency} className="fx-item">
              <div>
                <strong>USD / {rate.currency}</strong>
                <span className="small">{modified ? "Tasa modificada" : "Hoy"}</span>
              </div>
              <b>{shown !== undefined && shown !== null ? fxRate(shown) : busy ? "…" : "—"}</b>
              <small>
                {modified
                  ? `Aplica el ${modified.date}`
                  : crypto && quote !== null
                    ? `1 ${rate.currency} = ${usd(1 / quote)}`
                    : "1 USD en esta moneda"}
              </small>
              {rate.currency === "USDC" ? <small>{USDC_NETWORKS.join(" · ")}</small> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RateEditor() {
  const session = useSession();
  const currencies = [...FIAT_CODES, ...CRYPTO_CODES];
  const [currency, setCurrency] = useState<string>(currencies[0] ?? "COP");
  const [date, setDate] = useState(DEMO_ISSUE_DATE);

  useEffect(() => {
    setDate(paymentDate());
  }, []);
  const [value, setValue] = useState("");
  const [scope, setScope] = useState<FxScope>("day");
  const [invoiceId, setInvoiceId] = useState("");
  const [vendorId, setVendorId] = useState(session.vendorCards[0]?.id ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const matchingInvoices = session.invoices.filter((invoice) => invoice.currency === currency);

  function apply(event: FormEvent) {
    event.preventDefault();
    const rateToUsd = Number(value.replace(",", "."));
    if (!Number.isFinite(rateToUsd) || rateToUsd <= 0) {
      setFormError("Escribe un valor mayor que cero.");
      return;
    }
    if (!date) {
      setFormError("Elige la fecha.");
      return;
    }
    if (scope === "invoice" && !invoiceId) {
      setFormError("Elige la factura.");
      return;
    }
    if (scope === "vendor" && !vendorId) {
      setFormError("Elige el proveedor.");
      return;
    }
    setFormError(null);
    session.saveFxOverride({
      id: `fx-${crypto.randomUUID()}`,
      scope,
      date,
      currency,
      rateToUsd,
      invoiceId: scope === "invoice" ? invoiceId : undefined,
      vendorId: scope === "vendor" ? vendorId : undefined,
    });
    setValue("");
  }

  return (
    <section className="panel">
      <h2>Agregar tasa</h2>
      <p>La referencia de hoy se muestra arriba. Si agregas una tasa, esa tasa modificada es la que se aplica.</p>
      <form onSubmit={apply}>
        <div className="form-grid">
          <label className="field">
            <span>Moneda</span>
            <select
              value={currency}
              onChange={(event) => {
                setCurrency(event.target.value);
                setInvoiceId("");
              }}
            >
              {currencies.map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Fecha</span>
            <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="field">
            <span>Valor por 1 USD</span>
            <input inputMode="decimal" required value={value} onChange={(event) => setValue(event.target.value)} />
          </label>
          <label className="field">
            <span>Alcance</span>
            <select value={scope} onChange={(event) => setScope(event.target.value as FxScope)}>
              <option value="day">Global de ese día</option>
              <option value="invoice">Solo esta factura</option>
              <option value="vendor">Este proveedor ese día</option>
            </select>
          </label>
          {scope === "invoice" ? (
            <label className="field">
              <span>Factura</span>
              <select
                value={invoiceId}
                onChange={(event) => {
                  setInvoiceId(event.target.value);
                }}
              >
                <option value="">Elige una factura</option>
                {matchingInvoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.id} · {invoice.currency}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {scope === "vendor" ? (
            <label className="field">
              <span>Proveedor</span>
              <select value={vendorId} onChange={(event) => setVendorId(event.target.value)}>
                {session.vendorCards.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendorDisplay(vendor.id, vendor.name)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {formError ? <p className="small">{formError}</p> : null}
        <button className="btn primary" type="submit">
          Aplicar tasa
        </button>
      </form>
      {session.fxOverrides.length > 0 ? (
        <ul>
          {session.fxOverrides.map((item) => (
            <li key={item.id} className="bank-row">
              <strong>
                {item.currency} · {fxRate(item.rateToUsd)} · {item.date}
              </strong>
              <p>
                Tasa modificada · {fxScopeLabel(item.scope)}
                {item.invoiceId ? ` · ${item.invoiceId}` : ""}
                {item.vendorId
                  ? ` · ${vendorDisplay(item.vendorId, session.vendorCards.find((vendor) => vendor.id === item.vendorId)?.name ?? item.vendorId)}`
                  : ""}
              </p>
              <button className="text-btn" type="button" onClick={() => session.removeFxOverride(item.id)}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
