"use client";

import { ByokModal } from "@/components/byok-modal";
import { OpenClawDrawer } from "@/components/openclaw-drawer/openclaw-drawer";
import { useSession } from "@/components/session/session-provider";
import { fxRate } from "@/lib/format";
import { fxTickerRates } from "@/lib/mock-data/fx-ledger";
import {
  BarChart3,
  CircleHelp,
  FileText,
  KeyRound,
  Mail,
  MessagesSquare,
  RefreshCw,
  RotateCcw,
  Scale,
  Shield,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const NAV = [
  { href: "/", label: "Facturas", icon: FileText, match: (path: string) => path === "/" || path.startsWith("/facturas") },
  { href: "/correo", label: "Bandeja de correos", icon: Mail, match: (path: string) => path.startsWith("/correo") },
  { href: "/estadisticas", label: "Estadísticas", icon: BarChart3, match: (path: string) => path.startsWith("/estadisticas") },
  { href: "/proveedores", label: "Proveedores", icon: Users, match: (path: string) => path.startsWith("/proveedores") },
  { href: "/tasas", label: "Tasas", icon: Scale, match: (path: string) => path.startsWith("/tasas") },
  { href: "/reglas", label: "Reglas", icon: SlidersHorizontal, match: (path: string) => path.startsWith("/reglas") },
  { href: "/registro", label: "Registro", icon: FileText, match: (path: string) => path.startsWith("/registro") },
  { href: "/ayuda", label: "Ayuda", icon: CircleHelp, match: (path: string) => path.startsWith("/ayuda") },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSession();
  const rates = fxTickerRates().filter((rate) => rate.currency !== "USD");
  const [tickerIndex, setTickerIndex] = useState(0);
  const [tickerPaused, setTickerPaused] = useState(false);

  useEffect(() => {
    if (tickerPaused) return;
    const timer = window.setInterval(() => setTickerIndex((current) => current + 1), 6000);
    return () => window.clearInterval(timer);
  }, [tickerPaused]);

  if (pathname.startsWith("/dev")) return <>{children}</>;

  const rate = rates[tickerIndex % rates.length];

  return (
    <>
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="Blinka Guard, inicio">
          <span className="brand-mark">
            <Shield className="icon" />
          </span>
          <span className="brand-name">
            blinka<span>GUARD</span>
          </span>
        </Link>
        <div className="org">
          <span className="org-mark">N</span>
          <div>
            <strong>NovaLatam Holdings</strong>
            <small>Equipo de finanzas</small>
          </div>
        </div>
        <nav className="nav" aria-label="Navegación principal">
          {NAV.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
                <Icon className="icon" />
                <span>{item.label}</span>
                {item.href === "/" && session.reviewCount > 0 ? <span className="nav-count">{session.reviewCount}</span> : null}
              </Link>
            );
          })}
        </nav>
        <section className="ticker" aria-label="Tasas favoritas">
          <div className="ticker-head">
            <strong>Tus tasas</strong>
            <Link href="/tasas">Configurar</Link>
          </div>
          <div id="ticker-value">
            <span>USD / {rate?.currency}</span>
            <strong>{rate ? fxRate(rate.rateToUsd) : "Sin tasa"}</strong>
            <small>
              {rate?.date} · Indicativa
            </small>
          </div>
          <button className="text-btn" type="button" onClick={() => setTickerPaused((current) => !current)}>
            {tickerPaused ? "Reanudar" : "Pausar"}
          </button>
        </section>
        <div className="nav-bottom">
          <span className="demo-label">
            <Shield className="icon" /> Datos de ejemplo
          </span>
          <p className="sidebar-note">Solo facturas sintéticas. Ningún pago sale de esta sesión.</p>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            NovaLatam Holdings LLC <strong>/ Octubre 2026</strong>
          </div>
          <div className="top-actions">
            <button className="text-btn" type="button" onClick={session.reset}>
              <RotateCcw className="icon" /> Restaurar
            </button>
            <button className="text-btn" type="button" onClick={() => session.setByokOpen(true)}>
              <KeyRound className="icon" /> Claves
            </button>
            <button className="text-btn" type="button" onClick={() => session.setDrawerOpen(true)}>
              <MessagesSquare className="icon" /> OpenClaw
            </button>
            <button
              className="text-btn"
              type="button"
              disabled={session.running}
              onClick={() => void session.runLive(session.invoices.map((invoice) => invoice.id))}
            >
              <RefreshCw className="icon" /> {session.running ? "Ejecutando…" : "Pipeline en vivo"}
            </button>
            <Link href="/ayuda" className="text-btn">
              Ayuda
            </Link>
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
  );
}
