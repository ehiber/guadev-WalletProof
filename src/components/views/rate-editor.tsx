"use client";

import { useSession } from "@/components/session/session-provider";
import { SearchMenu } from "@/components/ui/select-menu";
import { Dialog, RequiredMark, RequiredNote } from "@/components/ui/ui";
import { currencyChoices, isPayableCurrency, normalizeCurrency } from "@/lib/engine/currency";
import type { FxOverride } from "@/lib/engine/fx-overrides";
import { DEMO_ISSUE_DATE, lookupFx, paymentDate } from "@/lib/mock-data/fx-ledger";
import { createContext, useContext, useMemo, useState, type FormEvent, type ReactNode } from "react";

const FEATURED_LIMIT = 4;
const DEFAULT_FEATURED = ["COP", "MXN", "VES"];
const SUGGESTIONS = ["Tasa confirmada con la fuente indicada.", "No había referencia disponible."];

export type RateDraft = {
  from: string;
  to: string;
  value: string;
  sourceName: string;
  comment: string;
  featured: boolean;
  showErrors: boolean;
};

export type RateChange = {
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

type RateEditorApi = {
  featured: string[];
  toggleStar: (currency: string) => void;
  openCreate: () => void;
  openEdit: (currency: string, rate: number | null, manual?: FxOverride) => void;
  openForCurrency: (currency: string) => void;
  editorOpen: boolean;
  history: RateChange[];
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
};

const RateEditorContext = createContext<RateEditorApi | null>(null);

export function useRateEditor(): RateEditorApi {
  const value = useContext(RateEditorContext);
  if (!value) throw new Error("useRateEditor debe usarse dentro de RateEditorProvider");
  return value;
}

export function RateEditorProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const [featured, setFeatured] = useState<string[]>(DEFAULT_FEATURED);
  const [draft, setDraft] = useState<RateDraft | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<RateChange[]>([]);

  const currencyOptions = useMemo(
    () => currencyChoices().map((choice) => ({ value: choice.code, label: `${choice.code} · ${choice.name}` })),
    [],
  );

  function pin(currency: string, want: boolean) {
    setFeatured((current) => {
      const without = current.filter((item) => item !== currency);
      if (!want) return without;
      return [...without, currency].slice(-FEATURED_LIMIT);
    });
  }

  function toggleStar(currency: string) {
    setFeatured((current) => {
      if (current.includes(currency)) return current.filter((item) => item !== currency);
      if (current.length >= FEATURED_LIMIT) return current;
      return [...current, currency];
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

  function openForCurrency(currency: string) {
    const asOf = paymentDate();
    const manual = [...session.fxOverrides]
      .reverse()
      .find((item) => item.scope === "day" && item.currency === currency && item.date.slice(0, 10) === asOf);
    const market = session.fxMarket.find((item) => item.currency === currency && item.rateToUsd > 0);
    const ledger = lookupFx(DEMO_ISSUE_DATE, currency);
    const rate = manual?.rateToUsd ?? market?.rateToUsd ?? ledger?.rateToUsd ?? null;
    openEdit(currency, rate, manual);
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
  const title = draft?.from && draft.to ? `Editar ${draft.from} / ${draft.to}` : "Añadir tasa manual";
  const asOf = paymentDate();

  const api: RateEditorApi = {
    featured,
    toggleStar,
    openCreate,
    openEdit,
    openForCurrency,
    editorOpen: draft !== null,
    history,
    historyOpen,
    setHistoryOpen,
  };

  return (
    <RateEditorContext.Provider value={api}>
      {children}
      <Dialog open={draft !== null} title={title} className="id-modal" onClose={() => setDraft(null)}>
        {draft ? (
          <form className="fx-form" noValidate onSubmit={save}>
            <RequiredNote />
            <div className="vendor-pair">
              <label className={`field${draft.showErrors && parsed && !parsed.fromOk ? " invalid" : ""}`}>
                <span>
                  De
                  <RequiredMark />
                </span>
                <SearchMenu
                  label="De"
                  required
                  placeholder="Buscar moneda"
                  value={draft.from}
                  options={currencyOptions}
                  onChange={(from) => setDraft({ ...draft, from })}
                />
              </label>
              <label className={`field${draft.showErrors && parsed && !parsed.toOk ? " invalid" : ""}`}>
                <span>
                  A
                  <RequiredMark />
                </span>
                <SearchMenu
                  label="A"
                  required
                  placeholder="Buscar moneda"
                  value={draft.to}
                  options={currencyOptions}
                  onChange={(to) => setDraft({ ...draft, to })}
                />
              </label>
            </div>
            <label className={`field${draft.showErrors && parsed && !parsed.valueOk ? " invalid" : ""}`}>
              <span>
                Valor por 1 unidad de origen
                <RequiredMark />
              </span>
              <input
                aria-required="true"
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
                <span className="fx-locked">{asOf}</span>
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
    </RateEditorContext.Provider>
  );
}

function existingOverrideId(currency: string, date: string, overrides: FxOverride[]): string {
  return overrides.find((item) => item.scope === "day" && item.currency === currency && item.date.slice(0, 10) === date)?.id ?? `fx-${crypto.randomUUID()}`;
}

function rateFigure(value: number): string {
  const digits = value >= 100 ? 2 : value >= 1 ? 4 : 8;
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: digits, useGrouping: true }).format(value);
}

function parseRate(value: string): number | null {
  const numeric = Number(value.trim().replace(",", "."));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
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
