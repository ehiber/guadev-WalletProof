"use client";

import { OPENCLAW_DEMO_SECRET, type OpenClawEvent } from "@/lib/openclaw/constants";
import { useEffect, useState } from "react";

export function OpenClawDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [events, setEvents] = useState<OpenClawEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      const response = await fetch("/api/webhooks/openclaw", {
        headers: { "x-openclaw-secret": OPENCLAW_DEMO_SECRET },
      });
      if (!response.ok) {
        if (!cancelled) setError("No se pudo leer la bitácora.");
        return;
      }
      const body = (await response.json()) as { events: OpenClawEvent[] };
      if (!cancelled) {
        setEvents(body.events);
        setError(null);
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open]);

  if (!open) return null;

  async function send(kind: OpenClawEvent["kind"], invoiceId: string, payload: unknown) {
    const response = await fetch("/api/webhooks/openclaw", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-openclaw-secret": OPENCLAW_DEMO_SECRET,
      },
      body: JSON.stringify({ kind, invoiceId, payload }),
    });
    if (!response.ok) {
      setError("El webhook rechazó el evento.");
      return;
    }
    const body = (await response.json()) as { event: OpenClawEvent };
    setEvents((current) => [...current, body.event].slice(-50));
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-[#e6e8ee] bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-[#e6e8ee] px-4 py-3">
        <div>
          <h2 className="font-semibold text-[#121826]">OpenClaw</h2>
          <p className="text-xs text-[#5c6575]">Bitácora viva de este proceso</p>
        </div>
        <button className="btn" onClick={onClose} type="button">
          Cerrar
        </button>
      </div>
      <div className="flex gap-2 border-b border-[#e6e8ee] p-3">
        <button
          className="btn"
          onClick={() =>
            void send("ingest", "INV-07", {
              channel: "whatsapp",
              text: "Pago urgente de 450 USD a la cuenta nueva ••••3310",
            })
          }
          type="button"
        >
          Simular factura
        </button>
        <button
          className="btn"
          onClick={() =>
            void send("approval", "INV-03", {
              decision: "APPROVED",
              note: "Excepción de demo firmada por el CFO.",
            })
          }
          type="button"
        >
          Simular aprobación
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-auto p-4">
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        {events.length === 0 ? <p className="text-sm text-[#5c6575]">Todavía no hay eventos.</p> : null}
        {events.map((event) => (
          <article key={event.id} className="rounded-lg bg-[#f4f6f8] p-3 text-sm">
            <p className="font-medium text-[#121826]">
              {event.kind} · {event.invoiceId ?? "sin factura"}
            </p>
            <p className="text-xs text-[#5c6575]">{event.at}</p>
            <pre className="mt-2 overflow-auto text-[11px] leading-5">{JSON.stringify(event.payload, null, 2)}</pre>
          </article>
        ))}
      </div>
    </aside>
  );
}
