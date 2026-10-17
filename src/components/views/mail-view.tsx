"use client";

import { useSession } from "@/components/session/session-provider";
import { Button } from "@/components/ui/ui";
import Link from "next/link";
import { useState } from "react";

export function MailView() {
  const session = useSession();
  const [query, setQuery] = useState("");
  const messages = (session.mail?.messages ?? []).filter((message) =>
    `${message.subject} ${message.from}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const connected = session.mail?.connected ?? false;

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-tight font-semibold tracking-tight">Bandeja de correos</h1>
          <p className="mt-2 text-[13px] text-muted">
            {connected ? session.mail?.address : "Sin buzón configurado"}. El sondeo real es el inbound de Gmail. No se redactan ni se envían mensajes desde aquí.
          </p>
        </div>
        <Button type="button" disabled={session.mailBusy} onClick={() => void session.refreshMail()}>
          {session.mailBusy ? "Revisando…" : "Actualizar"}
        </Button>
      </div>
      <label className="mb-4 block max-w-sm">
        <span className="mb-1.5 block text-xs font-semibold">Buscar</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} className="field mt-0" placeholder="Asunto o remitente" />
      </label>
      {session.mail?.lastError ? <p className="mb-4 rounded-lg bg-danger-bg px-4 py-3 text-xs text-danger">{session.mail.lastError}</p> : null}
      <p className="mb-4 text-[11px] text-muted">
        {session.mail?.lastPollAt ? `Último sondeo ${new Date(session.mail.lastPollAt).toLocaleString("es")}` : "Todavía no hay sondeo."} · {connected ? "Conectado" : "Desconectado"}
      </p>
      <ul className="overflow-hidden rounded-xl border border-line bg-surface">
        {messages.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-muted">Todavía no entra correo.</li>
        ) : (
          messages.map((message) => (
            <li key={`${message.id}-${message.at}`} className="border-t border-[#edf0f6] px-4 py-4 first:border-0">
              <strong className="block text-xs">{message.subject || "Sin asunto"}</strong>
              <p className="mt-1 text-[11px] text-muted">
                {message.from} · {message.status}
                {message.reason ? ` · ${message.reason}` : ""}
              </p>
              {message.attachments.length > 0 ? <p className="text-[11px] text-muted">{message.attachments.join(", ")}</p> : null}
              <div className="mt-2 flex flex-wrap gap-3">
                {message.invoiceIds.map((id) => (
                  <Link key={id} href={`/facturas/${id}`} className="text-[11px] font-semibold text-accent no-underline">
                    {id}
                  </Link>
                ))}
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
