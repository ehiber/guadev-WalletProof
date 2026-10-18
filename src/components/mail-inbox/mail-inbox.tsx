"use client";

import type { GmailStatus, MailLogStatus } from "@/lib/inbound/types";

function statusText(status: MailLogStatus): string {
  if (status === "ingested") return "Factura";
  if (status === "discarded") return "Descartado";
  if (status === "pending") return "Pendiente";
  return "Error";
}

function clock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

export function MailInbox({
  status,
  busy,
  onRefresh,
}: {
  status: GmailStatus | null;
  busy: boolean;
  onRefresh: () => void;
}) {
  const connected = status?.connected ?? false;
  return (
    <section className="rounded-xl border border-[#e6e8ee] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-[#5c6575]">Correo conectado</p>
          <p className="mt-1 font-semibold text-[#121826]">{connected ? status?.address : "Sin buzón configurado"}</p>
          <p className="text-xs text-[#5c6575]">
            {status?.lastPollAt ? `Último sondeo ${clock(status.lastPollAt)}` : "Todavía no hay sondeo."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-1 text-xs ring-1 ${connected ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-[#f4f6f8] text-[#5c6575] ring-[#e6e8ee]"}`}
          >
            {connected ? "Conectado" : "Desconectado"}
          </span>
          <button className="btn" disabled={busy} onClick={onRefresh} type="button">
            {busy ? "Revisando…" : "Revisar bandeja"}
          </button>
        </div>
      </div>
      {status?.lastError ? <p className="mt-3 text-sm text-rose-700">{status.lastError}</p> : null}
      <ul className="mt-3 space-y-2">
        {!status || status.messages.length === 0 ? (
          <li className="text-sm text-[#5c6575]">Todavía no entra correo.</li>
        ) : (
          status.messages.slice(0, 6).map((message) => (
            <li key={`${message.id}-${message.at}`} className="rounded-lg bg-[#f4f6f8] px-3 py-2 text-sm">
              <p className="font-medium text-[#121826]">{message.subject || "Sin asunto"}</p>
              <p className="text-xs text-[#5c6575]">
                {message.from} · {statusText(message.status)}
                {message.invoiceIds.length > 0 ? ` · ${message.invoiceIds.join(", ")}` : ""}
              </p>
              {message.attachments.length > 0 ? <p className="text-xs text-[#5c6575]">{message.attachments.join(", ")}</p> : null}
              {message.reason ? <p className="text-xs text-[#5c6575]">{message.reason}</p> : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
