"use client";

import { ByokModal } from "@/components/byok-modal";
import { OpenClawDrawer } from "@/components/openclaw-drawer/openclaw-drawer";
import { useSession } from "@/components/session/session-provider";
import { Button } from "@/components/ui/ui";
import {
  BarChart3,
  CircleHelp,
  Download,
  FileText,
  Flame,
  KeyRound,
  Mail,
  MessagesSquare,
  RotateCcw,
  Scale,
  Shield,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

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

const TITLES: Array<[string, string]> = [
  ["/facturas/nueva", "Añadir factura"],
  ["/correo", "Bandeja de correos"],
  ["/estadisticas", "Estadísticas"],
  ["/proveedores", "Proveedores"],
  ["/tasas", "Tasas"],
  ["/reglas", "Reglas"],
  ["/registro", "Registro"],
  ["/ayuda", "Ayuda"],
  ["/facturas", "Factura"],
  ["/", "Facturas"],
];

function titleFor(path: string): string {
  return TITLES.find(([prefix]) => path === prefix || (prefix !== "/" && path.startsWith(prefix)))?.[1] ?? "Blinka Guard";
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSession();
  const bare = pathname.startsWith("/dev");

  if (bare) return <>{children}</>;

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[224px] flex-col border-r border-line bg-canvas px-5 py-7 md:flex">
        <Link href="/" className="mb-8 flex items-center gap-2.5 text-ink no-underline" aria-label="Blinka Guard, inicio">
          <span className="grid h-[38px] w-[34px] place-items-center rounded-[10px] rounded-b-[14px] bg-accent text-white">
            <Shield className="h-4 w-4" />
          </span>
          <span className="text-2xl leading-none font-semibold tracking-tight">
            blinka
            <span className="mt-1.5 block text-xs font-medium tracking-[0.18em]">GUARD</span>
          </span>
        </Link>
        <div className="mb-6 flex items-center gap-2.5 border-y border-line py-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-[#d1d7e5] text-sm font-semibold">N</span>
          <div>
            <strong className="block text-xs">NovaLatam Holdings</strong>
            <small className="text-[11px] text-muted">Equipo de finanzas</small>
          </div>
        </div>
        <nav className="flex flex-col gap-1.5" aria-label="Navegación principal">
          {NAV.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[13px] no-underline ${active ? "bg-nav-active text-nav-active-text" : "text-muted hover:bg-[#eceff8]"}`}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span>{item.label}</span>
                {item.href === "/" && session.reviewCount > 0 ? (
                  <span className="ml-auto min-w-[22px] rounded-md bg-[#fff9ed] text-center text-[11px] leading-[22px] text-warn">
                    {session.reviewCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto pt-6">
          <span className="inline-flex items-center gap-1.5 rounded-[5px] border border-[#d1d7e5] px-2 py-1 text-[11px] text-muted">
            <Shield className="h-3 w-3" /> Datos de ejemplo
          </span>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">Solo facturas sintéticas. Ningún pago sale de esta sesión.</p>
        </div>
      </aside>
      <div className="md:ml-[224px]">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-line bg-white px-4 md:h-[76px] md:px-10">
          <div className="min-w-0 text-xs text-muted">
            NovaLatam <strong className="font-medium text-ink">/ {titleFor(pathname)}</strong>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="text" onClick={session.reset} type="button">
              <RotateCcw className="h-3.5 w-3.5" /> Restaurar
            </Button>
            <Button variant="text" className="hidden sm:inline-flex" onClick={session.exportCsv} type="button">
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button variant="text" className="hidden lg:inline-flex" onClick={() => session.setDrawerOpen(true)} type="button">
              <MessagesSquare className="h-3.5 w-3.5" /> OpenClaw
            </Button>
            <Button variant="text" onClick={() => session.setByokOpen(true)} type="button">
              <KeyRound className="h-3.5 w-3.5" /> Claves
            </Button>
            <Button variant="primary" disabled={session.running} onClick={() => void session.runLive(session.invoices.map((invoice) => invoice.id))} type="button">
              <Flame className="h-3.5 w-3.5" /> {session.running ? "Ejecutando…" : "Pipeline en vivo"}
            </Button>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-canvas px-3 py-2 md:hidden" aria-label="Navegación principal">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-lg px-2.5 py-2 text-[11px] no-underline ${active ? "bg-nav-active text-nav-active-text" : "text-muted"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <main className="mx-auto min-h-[calc(100vh-76px)] max-w-[1640px] px-4 py-6 md:px-10 md:py-8">{children}</main>
      </div>
      <ByokModal open={session.byokOpen} keys={session.keys} onClose={() => session.setByokOpen(false)} onSave={session.saveKeys} />
      <OpenClawDrawer open={session.drawerOpen} onClose={() => session.setDrawerOpen(false)} />
    </div>
  );
}
