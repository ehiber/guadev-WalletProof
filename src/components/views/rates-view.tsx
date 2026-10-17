"use client";

import { useSession } from "@/components/session/session-provider";
import { fxRate, usd } from "@/lib/format";
import { CRYPTO_CODES, DEMO_ISSUE_DATE, FIAT_CODES, USDC_NETWORKS, fxTickerRates, type FxReference } from "@/lib/mock-data/fx-ledger";
import type { FxRate } from "@/types/blinka";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export function RatesView() {
  const session = useSession();
  const rates = fxTickerRates();
  const fiat = rates.filter((rate) => (FIAT_CODES as readonly string[]).includes(rate.currency));
  const crypto = rates.filter((rate) => (CRYPTO_CODES as readonly string[]).includes(rate.currency));
  const used = session.records.filter((record) => record.fxSnapshot);
  const [reference, setReference] = useState<FxReference | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function consult() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/fx/reference");
      const body = (await response.json()) as FxReference;
      if (!response.ok) throw new Error("La referencia no respondió.");
      setReference(body);
      if (body.errors.length > 0 && body.fiat.length === 0 && body.crypto.length === 0) setError(body.errors.join(" "));
    } catch {
      setError("No se pudieron obtener las tasas. La decisión sigue usando el libro sintético.");
    } finally {
      setBusy(false);
    }
  }

  function quoteFor(currency: string): number | null {
    const quote = [...(reference?.fiat ?? []), ...(reference?.crypto ?? [])].find((item) => item.currency === currency);
    return quote?.unitsPerUsd ?? null;
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Tasas de cambio</h1>
          <p>1 USD equivale al valor mostrado. El veredicto usa el libro; la consulta del día no lo reemplaza.</p>
        </div>
        <button className="btn" type="button" disabled={busy} onClick={() => void consult()}>
          <RefreshCw className="icon" /> {busy ? "Consultando…" : "Consultar referencia del día"}
        </button>
      </div>
      <div className="notice info">
        <p>
          Codex consulta open.er-api.com y deja la respuesta como propuesta. Aquí el hash congela el libro del {DEMO_ISSUE_DATE}. La referencia de hoy, fiat o cripto, se muestra al lado y no reabre una decisión.
        </p>
      </div>
      {error ? (
        <div className="notice error">
          <p>{error}</p>
        </div>
      ) : null}
      {reference?.errors.map((item) => (
        <div key={item} className="notice error">
          <p>{item} Puedes seguir con el libro.</p>
        </div>
      ))}
      <RateStrip title="Monedas del libro" rates={fiat} quoteFor={quoteFor} />
      <RateStrip title="Criptomonedas del libro" rates={crypto} quoteFor={quoteFor} crypto />
      <section className="panel">
        <h2>Conversiones del lote</h2>
        <p>Cada fila muestra el total original, la tasa congelada y el USD del registro.</p>
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
                    <td>{fxRate(record.fxSnapshot.rateToUsd)}</td>
                    <td className="money">{usd(record.totalPayableUsd)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <p className="page-footer">
        El libro cubre USD y los corredores locales EUR, BRL, ARS, PEN, CRC, COP, MXN, CLP, BOB y ZAR, más VES. USDC vale lo mismo en {USDC_NETWORKS.join(", ")}. Una fecha sin tasa queda rechazada.
      </p>
    </>
  );
}

function RateStrip({
  title,
  rates,
  quoteFor,
  crypto = false,
}: {
  title: string;
  rates: FxRate[];
  quoteFor: (currency: string) => number | null;
  crypto?: boolean;
}) {
  return (
    <section className="fx-strip" aria-label={title}>
      <div className="section-heading">
        <h2>{title}</h2>
        <span className="small muted">{DEMO_ISSUE_DATE}</span>
      </div>
      <div className="fx-grid">
        {rates.map((rate) => {
          const quote = quoteFor(rate.currency);
          return (
            <article key={rate.currency} className="fx-item">
              <div>
                <strong>USD / {rate.currency}</strong>
                <span className="small">{crypto ? "Cripto de demo" : "Demo sintética"}</span>
              </div>
              <b>{fxRate(rate.rateToUsd)}</b>
              <small>
                {crypto ? `1 ${rate.currency} = ${usd(1 / rate.rateToUsd)}` : `${rate.date} · 1 USD en ${rate.currency}`}
              </small>
              {rate.currency === "USDC" ? <small>{USDC_NETWORKS.join(" · ")}</small> : null}
              <small>{rate.source}</small>
              {quote !== null ? <small>Hoy {fxRate(quote)} · no entra al veredicto</small> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
