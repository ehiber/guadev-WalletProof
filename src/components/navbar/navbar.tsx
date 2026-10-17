"use client";

import { Download, Flame, KeyRound, MessagesSquare, RotateCcw, Shield } from "lucide-react";

export function Navbar({
  running,
  onReset,
  onExport,
  onOpenClaw,
  onByok,
  onLive,
}: {
  running: boolean;
  onReset: () => void;
  onExport: () => void;
  onOpenClaw: () => void;
  onByok: () => void;
  onLive: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-[#e6e8ee] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-4 py-3">
        <div className="mr-auto flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#121826] text-white">
            <Shield className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight text-[#121826]">Blinka Guard</p>
            <p className="text-xs text-[#5c6575]">NovaLatam Holdings LLC</p>
          </div>
        </div>
        <button className="btn" onClick={onReset} type="button">
          <RotateCcw className="h-4 w-4" />
          Restaurar
        </button>
        <button className="btn" onClick={onExport} type="button">
          <Download className="h-4 w-4" />
          Exportar CSV
        </button>
        <button className="btn" onClick={onOpenClaw} type="button">
          <MessagesSquare className="h-4 w-4" />
          OpenClaw
        </button>
        <button className="btn" onClick={onByok} type="button">
          <KeyRound className="h-4 w-4" />
          API Keys
        </button>
        <button className="btn btn-hot" disabled={running} onClick={onLive} type="button">
          <Flame className="h-4 w-4" />
          {running ? "Ejecutando…" : "Ejecutar Pipeline IA en Vivo"}
        </button>
      </div>
    </header>
  );
}
