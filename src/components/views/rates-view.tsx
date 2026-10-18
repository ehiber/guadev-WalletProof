"use client";

import { useSession } from "@/components/session/session-provider";
import { useRateEditor } from "@/components/views/rate-editor";
import { Dialog } from "@/components/ui/ui";
import type { FxOverride } from "@/lib/engine/fx-overrides";
import { CRYPTO_CODES, DEMO_ISSUE_DATE, FIAT_CODES, lookupFx, paymentDate } from "@/lib/mock-data/fx-ledger";
import { Plus, RefreshCw, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";

function rateSource(manual: FxOverride | undefined, market: { source: string } | undefined, ledger: { source: string } | null): string {
  if (manual) return manual.sourceName?.trim() || "Manual";
  if (market) return apiSource(market.source);
  if (ledger) return "Tasa de ejemplo";
  return "Sin fuente";
}

function apiSource(source: string): string {
  if (source.includes("CoinGecko")) return "API · CoinGecko";
  if (source.includes("ExchangeRate")) return "API · ExchangeRate";
  return source;
}

function rateFigure(value: number): string {
  const digits = value >= 100 ? 2 : value >= 1 ? 4 : 8;
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: digits, useGrouping: true }).format(value);
}

export function RatesView() {
  const session = useSession();
  const editor = useRateEditor();
  const { featured } = editor;
  const [query, setQuery] = useState("");
  const [asOf] = useState(paymentDate);
  const rows = useMemo(() => {
    const known = [...FIAT_CODES, ...CRYPTO_CODES] as string[];
    const extras = session.fxOverrides
      .filter((item) => item.scope === "day" && !known.includes(item.currency))
      .map((item) => item.currency);
    const codes = [...known, ...extras];
    return codes
      .map((currency) => {
        const manual = [...session.fxOverrides]
          .reverse()
          .find((item) => item.scope === "day" && item.currency === currency && item.date.slice(0, 10) === asOf);
        const market = session.fxMarket.find((item) => item.currency === currency && item.rateToUsd > 0);
        const ledger = lookupFx(DEMO_ISSUE_DATE, currency);
        const rate = manual?.rateToUsd ?? market?.rateToUsd ?? ledger?.rateToUsd ?? null;
        return {
          currency,
          rate,
          date: rate === null ? null : (manual?.date ?? market?.date ?? ledger?.date ?? asOf).slice(0, 10),
          sourceLabel: rateSource(manual, market, ledger),
          manual,
        };
      })
      .sort((left, right) => {
        const leftStar = featured.indexOf(left.currency);
        const rightStar = featured.indexOf(right.currency);
        if (leftStar >= 0 || rightStar >= 0) {
          if (leftStar < 0) return 1;
          if (rightStar < 0) return -1;
          return leftStar - rightStar;
        }
        return codes.indexOf(left.currency) - codes.indexOf(right.currency);
      });
  }, [asOf, featured, session.fxMarket, session.fxOverrides]);

  const visible = rows.filter((row) => {
    const haystack = `usd / ${row.currency} ${row.currency}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const cards = rows.filter((row) => featured.includes(row.currency));

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Tasas de cambio</h1>
          <p>Consulta y gestiona las tasas para tus pagos.</p>
        </div>
        <div className="heading-actions">
          <button className="btn" type="button" disabled={session.fxBusy} onClick={() => void session.refreshFx()}>
            <RefreshCw className="icon" /> {session.fxBusy ? "Consultando…" : "Consultar referencia del día"}
          </button>
          <button className="btn primary" type="button" onClick={editor.openCreate}>
            <Plus className="icon" /> Añadir tasa manual
          </button>
        </div>
      </div>
      {session.fxError ? (
        <div className="notice error">
          <p>{session.fxError}</p>
        </div>
      ) : null}
      <div className="fx-featured-head">
        <h2>Destacadas</h2>
        <span>Marca ★ para tener hasta 4 a mano.</span>
      </div>
      {cards.length === 0 ? (
        <p className="fx-featured-empty">Todavía no hay tasas destacadas.</p>
      ) : (
        <div className="fx-cards">
          {cards.map((row) => (
            <article key={row.currency} className="fx-card">
              <div className="fx-card-top">
                <strong>USD / {row.currency}</strong>
                <button className="fx-star on" type="button" aria-pressed="true" aria-label={`Quitar USD / ${row.currency} de destacadas`} onClick={() => editor.toggleStar(row.currency)}>
                  <Star className="icon" fill="currentColor" />
                </button>
              </div>
              <p className="fx-card-rate">
                {row.rate === null ? (
                  <span className="fx-missing">Falta añadir el valor</span>
                ) : (
                  <>
                    1 USD = <strong>{rateFigure(row.rate)}</strong> {row.currency}
                  </>
                )}
              </p>
              <div className="fx-card-foot">
                <span>{row.rate === null ? "Sin valor" : row.sourceLabel}</span>
                <button type="button" onClick={() => editor.openEdit(row.currency, row.rate, row.manual)}>
                  {row.rate === null ? "Añadir valor" : "Editar"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <label className="plist-search fx-search">
        <Search className="icon" />
        <span className="visually-hidden">Buscar moneda o par</span>
        <input type="search" value={query} placeholder="Buscar moneda o par" onChange={(event) => setQuery(event.target.value)} />
      </label>
      <section className="plist fx-board" aria-label="Tasas de cambio">
        {visible.length === 0 ? (
          <div className="empty">
            <h2>No hay tasas que coincidan</h2>
            <p>Prueba con el código de la moneda, por ejemplo COP.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Par de monedas</th>
                  <th scope="col">Tasa</th>
                  <th scope="col">Fuente y fecha</th>
                  <th scope="col">
                    <span className="visually-hidden">Acción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const starred = featured.includes(row.currency);
                  return (
                    <tr key={row.currency}>
                      <td>
                        <div className="fx-pair">
                          <button
                            className={`fx-star${starred ? " on" : ""}`}
                            type="button"
                            aria-pressed={starred}
                            aria-label={starred ? `Quitar USD / ${row.currency} de destacadas` : `Destacar USD / ${row.currency}`}
                            onClick={() => editor.toggleStar(row.currency)}
                          >
                            <Star className="icon" fill={starred ? "currentColor" : "none"} />
                          </button>
                          <strong>USD / {row.currency}</strong>
                        </div>
                      </td>
                      <td>
                        {row.rate === null ? (
                          <span className="fx-missing">Falta añadir el valor</span>
                        ) : (
                          <>
                            1 USD = {rateFigure(row.rate)} {row.currency}
                          </>
                        )}
                      </td>
                      <td>
                        {row.rate === null ? (
                          "—"
                        ) : (
                          <>
                            <span className="fx-source">{row.sourceLabel}</span>
                            <small>{row.date}</small>
                          </>
                        )}
                      </td>
                      <td>
                        <button className="btn sm" type="button" onClick={() => editor.openEdit(row.currency, row.rate, row.manual)}>
                          {row.rate === null ? "Añadir valor" : "Editar tasa"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="fx-foot">
        <p>Valores de ejemplo e indicativos, no cotizaciones actuales.</p>
        <button className="text-btn" type="button" onClick={() => editor.setHistoryOpen(true)}>
          Ver historial de cambios
        </button>
      </div>
      <Dialog open={editor.historyOpen} title="Historial de cambios" className="id-modal" onClose={() => editor.setHistoryOpen(false)}>
        {editor.history.length === 0 ? (
          <p className="plist-modal-lead">Todavía no hay cambios manuales en esta sesión.</p>
        ) : (
          <ul className="plist-modal-list">
            {editor.history.map((item) => (
              <li key={item.id}>
                <strong>
                  {item.pair}
                  <small>{item.line}</small>
                </strong>
                <span>
                  Manual
                  <small>{item.date}</small>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="button-row">
          <button className="btn" type="button" onClick={() => editor.setHistoryOpen(false)}>
            Cerrar
          </button>
        </div>
      </Dialog>
    </>
  );
}
