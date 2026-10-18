"use client";

import { ByokModal } from "@/components/byok-modal";
import { OpenClawDrawer } from "@/components/openclaw-drawer/openclaw-drawer";
import { SideNav } from "@/components/shell/side-nav";
import { RateEditorProvider, useRateEditor } from "@/components/views/rate-editor";
import { useSession } from "@/components/session/session-provider";
import { fxRate } from "@/lib/format";
import { Menu, MessagesSquare, RefreshCw, RotateCcw, Shield } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSession();
  const [navOpen, setNavOpen] = useState(false);

  if (pathname.startsWith("/dev")) return <>{children}</>;

  return (
    <RateEditorProvider>
    <>
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <aside className={navOpen ? "sidebar ws-open" : "sidebar"}>
        <Link href="/" className="brand" aria-label="Wallet Proof, inicio">
          <span className="brand-mark">
            <Shield className="icon" />
          </span>
          <span className="brand-name">
            Wallet<span>Proof</span>
          </span>
        </Link>
        <div className="org">
          <span className="org-mark">N</span>
          <div>
            <strong>NovaLatam Holdings</strong>
            <small>Equipo de finanzas</small>
          </div>
        </div>
        <SideNav onNavigate={() => setNavOpen(false)} />
        <FavoriteTicker />
        <div className="nav-bottom">
          <p className="sidebar-credit">
            Hecho con amor <span aria-hidden="true">💙</span> por <a href="https://guadev.com" target="_blank" rel="noreferrer">GuaDev.com</a>
            <a href="https://github.com/YarumisGinanRM/YarumisGinanRM" target="_blank" rel="noreferrer">YarumisGinanRM</a>
            <a href="https://github.com/ehiber" target="_blank" rel="noreferrer">ehiber</a>
          </p>
          <span className="demo-label">
            <Shield className="icon" /> Datos de ejemplo
          </span>
          <p className="sidebar-note">Solo facturas sintéticas. Ningún pago sale de esta sesión.</p>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="ws-mobile-button"
              type="button"
              aria-label="Abrir menú"
              aria-expanded={navOpen}
              onClick={() => setNavOpen((current) => !current)}
            >
              <Menu className="icon" /> Menú
            </button>
            NovaLatam Holdings LLC <strong>/ Octubre 2026</strong>
          </div>
          <div className="top-actions">
            <span className="nav-tip">
              <button className="text-btn" type="button" aria-describedby="tip-restaurar" onClick={session.reset}>
                <RotateCcw className="icon" /> Restaurar
              </button>
              <span id="tip-restaurar" className="nav-tip-bubble" role="tooltip">
                Restablece todos los datos de la demo a su estado inicial.
              </span>
            </span>
            <span className="nav-tip">
              <button className="text-btn" type="button" aria-describedby="tip-openclaw" onClick={() => session.setDrawerOpen(true)}>
                <MessagesSquare className="icon" /> OpenClaw
              </button>
              <span id="tip-openclaw" className="nav-tip-bubble" role="tooltip">
                Abre el chat que simula las notificaciones enviadas por WhatsApp u otros canales.
              </span>
            </span>
            <span className="nav-tip align-end">
              <button
                className="text-btn"
                type="button"
                aria-describedby="tip-revisar-ia"
                disabled={session.running}
                onClick={() => void session.runLive(session.invoices.map((invoice) => invoice.id))}
              >
                <RefreshCw className="icon" /> {session.running ? "Revisando…" : "Revisar con IA"}
              </button>
              <span id="tip-revisar-ia" className="nav-tip-bubble" role="tooltip">
                Vuelve a analizar todas las facturas y actualiza la explicación de cada decisión.
              </span>
            </span>
            <div className="identity">
              <span className="avatar">MT</span>
              <span>
                <strong>María Torres</strong>
                <small>Finanzas</small>
              </span>
            </div>
          </div>
        </header>
        <main id="contenido">{children}</main>
      </div>
      <ByokModal open={session.byokOpen} keys={session.keys} onClose={() => session.setByokOpen(false)} onSave={session.saveKeys} />
      <OpenClawDrawer key={session.resetCount} open={session.drawerOpen} onClose={() => session.setDrawerOpen(false)} />
    </>
    </RateEditorProvider>
  );
}

function FavoriteTicker() {
  const session = useSession();
  const editor = useRateEditor();
  const rates = session.fxMarket.filter((rate) => rate.currency !== "USD");
  const [tickerIndex, setTickerIndex] = useState(0);
  const [tickerPaused, setTickerPaused] = useState(false);
  const [tickerHeld, setTickerHeld] = useState(false);
  const rate = rates.length > 0 ? rates[tickerIndex % rates.length] : undefined;

  useEffect(() => {
    if (tickerPaused || tickerHeld || editor.editorOpen) return;
    const timer = window.setInterval(() => setTickerIndex((current) => current + 1), 6000);
    return () => window.clearInterval(timer);
  }, [editor.editorOpen, tickerHeld, tickerPaused]);

  return (
    <section
      className="ticker"
      aria-label="Tasas favoritas"
      onMouseEnter={() => setTickerHeld(true)}
      onMouseLeave={() => setTickerHeld(false)}
      onFocus={() => setTickerHeld(true)}
      onBlur={() => setTickerHeld(false)}
    >
      <div className="ticker-head">
        <strong>Tus tasas</strong>
        <button
          className="ticker-edit"
          type="button"
          disabled={!rate}
          onClick={() => rate && editor.openForCurrency(rate.currency)}
        >
          {rate ? `Editar ${rate.currency}` : "Editar"}
        </button>
      </div>
      <div id="ticker-value">
        <span>USD / {rate?.currency}</span>
        <strong>{rate ? fxRate(rate.rateToUsd) : "Sin tasa"}</strong>
        <small>{rate ? `${rate.date} · API` : "Sin tasa del día"}</small>
      </div>
      <button className="text-btn" type="button" onClick={() => setTickerPaused((current) => !current)}>
        {tickerPaused ? "Reanudar" : "Pausar"}
      </button>
    </section>
  );
}
