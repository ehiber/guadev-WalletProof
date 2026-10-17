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
    const body = (await response.json().catch(() => null)) as { error?: string; event?: OpenClawEvent } | null;
    if (!response.ok) {
      setError(body?.error ?? "El webhook rechazó el evento.");
    }
    const listed = await fetch("/api/webhooks/openclaw", {
      headers: { "x-openclaw-secret": OPENCLAW_DEMO_SECRET },
    });
    if (listed.ok) {
      const log = (await listed.json()) as { events: OpenClawEvent[] };
      setEvents(log.events);
    }
  }

  async function sendEmail() {
    const response = await fetch("/api/inbound/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: "billing@cloudnova.example",
        subject: "Factura sintética CN-2026-1099",
        text: "CloudNova Infrastructure LLC. Número CN-2026-1099. Fecha 2026-10-16. Subtotal 300 USD. Impuesto 0. Total 300 USD. Descripción: almacenamiento adicional de octubre 2026.",
      }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) setError(body?.error ?? "El correo no entró.");
    const listed = await fetch("/api/webhooks/openclaw", {
      headers: { "x-openclaw-secret": OPENCLAW_DEMO_SECRET },
    });
    if (listed.ok) {
      const log = (await listed.json()) as { events: OpenClawEvent[] };
      setEvents(log.events);
    }
  }

  return (
    <aside className="drawer">
      <header>
        <div>
          <h2>OpenClaw</h2>
          <p className="budget-note">Bitácora viva de este proceso</p>
        </div>
        <button className="btn sm" onClick={onClose} type="button">
          Cerrar
        </button>
      </header>
      <div className="drawer-actions">
        <button
          className="btn"
          onClick={() =>
            void send("ingest", "", {
              channel: "whatsapp",
              text: "AndesSoft Devs LLC. Factura CHAT-URG-450. Fecha 2026-10-16. Subtotal 450 USD, impuesto 0, total 450 USD. Pago urgente a la cuenta nueva ••••3310, distinta de la contratada.",
            })
          }
          type="button"
        >
          Simular factura
        </button>
        <button className="btn" onClick={() => void sendEmail()} type="button">
          Simular correo
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
      <div className="drawer-log">
        {error ? <p className="notice error">{error}</p> : null}
        {events.length === 0 ? <p className="budget-note">Todavía no hay eventos.</p> : null}
        {events.map((event) => (
          <article key={event.id} className="provider-note">
            <strong>
              {event.kind} · {event.invoiceId || "sin factura"}
            </strong>
            <small>{event.at}</small>
            <pre>{JSON.stringify(event.payload, null, 2)}</pre>
          </article>
        ))}
      </div>
    </aside>
  );
}
