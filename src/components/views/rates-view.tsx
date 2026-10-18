"use client";

import { useSession } from "@/components/session/session-provider";
import { Dialog } from "@/components/ui/ui";
import type { FxOverride } from "@/lib/engine/fx-overrides";
import { isPayableCurrency, normalizeCurrency } from "@/lib/engine/currency";
import { CRYPTO_CODES, DEMO_ISSUE_DATE, FIAT_CODES, lookupFx, paymentDate } from "@/lib/mock-data/fx-ledger";
import { Plus, RefreshCw, Search, Star } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

const FEATURED_LIMIT = 4;
const DEFAULT_FEATURED = ["COP", "MXN", "VES"];
const SUGGESTIONS = ["Tasa confirmada con la fuente indicada.", "No había referencia disponible."];

type RateDraft = {
  from: string;
  to: string;
  value: string;
  sourceName: string;
  comment: string;
  featured: boolean;
  showErrors: boolean;
};

type RateChange = {
  id: string;
  pair: string;
  line: string;
  date: string;
};

const EMPTY_DRAFT: RateDraft = {
  from: "",
  to: "",
  value: "",
  sourceName: "",
  comment: "",
  featured: false,
  showErrors: false,
};

function rateFigure(value: number): string {
  const digits = value >= 100 ? 2 : value >= 1 ? 4 : 8;
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: digits, useGrouping: true }).format(value);
}

function parseRate(value: string): number | null {
  const numeric = Number(value.trim().replace(",", "."));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function RatesView() {
  const session = useSession();
  const [query, setQuery] = useState("");
  const [featured, setFeatured] = useState<string[]>(DEFAULT_FEATURED);
  const [draft, setDraft] = useState<RateDraft | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<RateChange[]>([]);
  const [today, setToday] = useState("");

  useEffect(() => {
    setToday(paymentDate());
  }, []);

  const asOf = today || DEMO_ISSUE_DATE;
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
          sourceLabel: manual ? "Manual" : "Carga inicial",
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

  function toggleStar(currency: string) {
    setFeatured((current) => {
      if (current.includes(currency)) return current.filter((item) => item !== currency);
      if (current.length >= FEATURED_LIMIT) return current;
      return [...current, currency];
    });
  }

  function pin(currency: string, want: boolean) {
    setFeatured((current) => {
      const without = current.filter((item) => item !== currency);
      if (!want) return without;
      return [...without, currency].slice(-FEATURED_LIMIT);
    });
  }

  function openCreate() {
    setDraft({ ...EMPTY_DRAFT });
  }

  function openEdit(currency: string, rate: number | null, manual?: FxOverride) {
    setDraft({
      from: "USD",
      to: currency,
      value: rate && rate > 0 ? String(rate) : "",
      sourceName: manual?.sourceName ?? "",
      comment: manual?.note ?? "",
      featured: featured.includes(currency),
      showErrors: false,
    });
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const parsed = parsedPair(draft);
    if (!parsed.pairOk || !parsed.currency || parsed.rateToUsd === undefined || !parsed.line) {
      setDraft({ ...draft, showErrors: true });
      return;
    }
    const date = paymentDate();
    const { currency, rateToUsd, line } = parsed;
    session.saveFxOverride({
      id: existingOverrideId(currency, date, session.fxOverrides),
      scope: "day",
      date,
      currency,
      rateToUsd,
      sourceName: draft.sourceName.trim() || undefined,
      note: draft.comment.trim() || undefined,
    });
    pin(currency, draft.featured);
    setHistory((current) => [{ id: crypto.randomUUID(), pair: `USD / ${currency}`, line, date }, ...current]);
    setDraft(null);
  }

  const parsed = draft ? parsedPair(draft) : null;

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
          <button className="btn primary" type="button" onClick={openCreate}>
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
                <button className="fx-star on" type="button" aria-pressed="true" aria-label={`Quitar USD / ${row.currency} de destacadas`} onClick={() => toggleStar(row.currency)}>
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
                <button type="button" onClick={() => openEdit(row.currency, row.rate, row.manual)}>
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
                            onClick={() => toggleStar(row.currency)}
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
                        <button className="btn sm" type="button" onClick={() => openEdit(row.currency, row.rate, row.manual)}>
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
        <button className="text-btn" type="button" onClick={() => setHistoryOpen(true)}>
          Ver historial de cambios
        </button>
      </div>
      <Dialog open={draft !== null} title="Añadir tasa manual" className="id-modal" onClose={() => setDraft(null)}>
        {draft ? (
          <form className="fx-form" noValidate onSubmit={save}>
            <div className="vendor-pair">
              <label className={`field${draft.showErrors && parsed && !parsed.fromOk ? " invalid" : ""}`}>
                <span>De</span>
                <input
                  placeholder="Ej.: USD"
                  value={draft.from}
                  onChange={(event) => setDraft({ ...draft, from: event.target.value })}
                />
              </label>
              <label className={`field${draft.showErrors && parsed && !parsed.toOk ? " invalid" : ""}`}>
                <span>A</span>
                <input placeholder="Ej.: COP" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
              </label>
            </div>
            <label className={`field${draft.showErrors && parsed && !parsed.valueOk ? " invalid" : ""}`}>
              <span>Valor por 1 unidad de origen</span>
              <input
                inputMode="decimal"
                placeholder="Ej.: 4200"
                value={draft.value}
                onChange={(event) => setDraft({ ...draft, value: event.target.value })}
              />
              {draft.showErrors && parsed && !parsed.pairOk ? (
                <small className="field-error">Define el par y un valor mayor que cero. Una de las dos monedas tiene que ser USD.</small>
              ) : null}
            </label>
            <p className={`fx-define${parsed?.pairOk ? " ready" : ""}`}>{parsed?.line ?? "Define el par y su valor"}</p>
            <div className="vendor-pair">
              <label className="field">
                <span>Fecha de aplicación</span>
                <input readOnly value={asOf} />
              </label>
              <label className="field">
                <span>Fuente</span>
                <input
                  placeholder="Nombre o enlace de la fuente"
                  value={draft.sourceName}
                  onChange={(event) => setDraft({ ...draft, sourceName: event.target.value })}
                />
              </label>
            </div>
            <label className="field">
              <span>Comentario adicional (opcional)</span>
              <textarea
                rows={3}
                placeholder="Añade contexto si lo necesitas"
                value={draft.comment}
                onChange={(event) => setDraft({ ...draft, comment: event.target.value })}
              />
            </label>
            <p className="fx-hint">Añadir contexto ayuda a entender esta tasa cuando se revise más adelante.</p>
            <div className="fx-chips">
              {SUGGESTIONS.map((text) => (
                <button key={text} type="button" onClick={() => setDraft({ ...draft, comment: text })}>
                  {text}
                </button>
              ))}
            </div>
            <label className="fx-check">
              <input type="checkbox" checked={draft.featured} onChange={(event) => setDraft({ ...draft, featured: event.target.checked })} />
              <span>Destacar esta tasa</span>
            </label>
            <p className="plist-note">Se guardará como manual para hoy. Las decisiones anteriores conservarán la tasa que utilizaron.</p>
            <div className="button-row">
              <button className="btn" type="button" onClick={() => setDraft(null)}>
                Cancelar
              </button>
              <button className="btn primary" type="submit">
                Guardar tasa
              </button>
            </div>
          </form>
        ) : null}
      </Dialog>
      <Dialog open={historyOpen} title="Historial de cambios" className="id-modal" onClose={() => setHistoryOpen(false)}>
        {history.length === 0 ? (
          <p className="plist-modal-lead">Todavía no hay cambios manuales en esta sesión.</p>
        ) : (
          <ul className="plist-modal-list">
            {history.map((item) => (
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
          <button className="btn" type="button" onClick={() => setHistoryOpen(false)}>
            Cerrar
          </button>
        </div>
      </Dialog>
    </>
  );
}

function existingOverrideId(currency: string, date: string, overrides: FxOverride[]): string {
  return overrides.find((item) => item.scope === "day" && item.currency === currency && item.date.slice(0, 10) === date)?.id ?? `fx-${crypto.randomUUID()}`;
}

function parsedPair(draft: RateDraft): {
  fromOk: boolean;
  toOk: boolean;
  valueOk: boolean;
  pairOk: boolean;
  currency?: string;
  rateToUsd?: number;
  line?: string;
} {
  const fromCode = normalizeCurrency(draft.from);
  const toCode = normalizeCurrency(draft.to);
  const fromOk = Boolean(fromCode && isPayableCurrency(fromCode));
  const toOk = Boolean(toCode && isPayableCurrency(toCode) && toCode !== fromCode);
  const numeric = parseRate(draft.value);
  const valueOk = numeric !== null;
  const usdSide = fromCode === "USD" || toCode === "USD";
  if (!fromOk || !toOk || !valueOk || !usdSide || !fromCode || !toCode || numeric === null) {
    return { fromOk, toOk, valueOk, pairOk: false };
  }
  const currency = fromCode === "USD" ? toCode : fromCode;
  const rateToUsd = fromCode === "USD" ? numeric : 1 / numeric;
  const line = fromCode === "USD" ? `1 USD = ${rateFigure(numeric)} ${toCode}` : `1 ${fromCode} = ${rateFigure(numeric)} USD`;
  return { fromOk, toOk, valueOk, pairOk: true, currency, rateToUsd, line };
}
