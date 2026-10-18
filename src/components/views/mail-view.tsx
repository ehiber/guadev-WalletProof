"use client";

import { useSession } from "@/components/session/session-provider";
import { hasFilePreview, SyntheticDocument } from "@/components/synthetic-document";
import type { MailLogEntry, MailLogStatus } from "@/lib/inbound/types";
import { RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const FOLDERS: Array<{ id: "all" | MailLogStatus; label: string }> = [
  { id: "all", label: "Recibidos" },
  { id: "ingested", label: "Ingresados" },
  { id: "discarded", label: "Descartados" },
  { id: "error", label: "Con error" },
];

function formatPoll(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

export function MailView() {
  const session = useSession();
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<(typeof FOLDERS)[number]["id"]>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const mail = mounted ? session.mail : null;
  const busy = mounted && session.mailBusy;
  const messages = (mail?.messages ?? []).filter((message) => {
    const inFolder = folder === "all" || message.status === folder;
    const haystack = `${message.subject} ${message.from} ${message.reason ?? ""}`.toLowerCase();
    return inFolder && haystack.includes(query.trim().toLowerCase());
  });
  const selected = messages.find((message) => message.id === selectedId) ?? messages[0] ?? null;
  const connected = mail?.connected ?? false;

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Bandeja de correos</h1>
          <p>
            {connected ? mail?.address : mounted ? "Sin buzón configurado" : "Cargando el sondeo"}. Se listan los mensajes de los últimos dos días. Esta bandeja no redacta ni envía mensajes.
          </p>
        </div>
        <div className="heading-actions">
          <button className="btn" type="button" disabled={busy} onClick={() => void session.refreshMail()}>
            <RefreshCw className="icon" /> {busy ? "Revisando…" : "Actualizar"}
          </button>
        </div>
      </div>
      {mail?.lastError ? (
        <div className="notice error">
          <p>{mail.lastError}</p>
        </div>
      ) : (
        <div className="notice info">
          <p>
            {mail?.lastPollAt ? `Último sondeo ${formatPoll(mail.lastPollAt)}` : mounted ? "Todavía no hay sondeo." : "Cargando el sondeo."} ·{" "}
            {connected ? "Conectado" : "Desconectado"}
          </p>
        </div>
      )}
      <div className="mail-toolbar">
        <div className="tabs" aria-label="Carpetas">
          {FOLDERS.map((item) => (
            <button key={item.id} className="tab" type="button" aria-pressed={folder === item.id} onClick={() => setFolder(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <label className="search">
          <Search className="icon" />
          <span className="visually-hidden">Buscar correos</span>
          <input type="search" value={query} placeholder="Buscar correos" onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>
      <div className="mail-layout">
        <section className="mail-list" aria-label="Correos recibidos">
          {messages.length === 0 ? (
            <div className="empty">
              <h3>No hay correos en esta vista</h3>
              <p>{mounted ? "Cambia la carpeta o la búsqueda." : "Cargando el sondeo."}</p>
            </div>
          ) : (
            messages.map((message) => (
              <button
                key={`${message.id}-${message.at}`}
                className={`mail-item${selected?.id === message.id ? " selected" : ""}`}
                type="button"
                onClick={() => setSelectedId(message.id)}
              >
                <strong>{message.subject || "Sin asunto"}</strong>
                <small>
                  {message.from}
                  {message.reason ? ` · ${message.reason}` : ""}
                </small>
                <span>
                  {statusLabel(message.status)} · {formatPoll(message.at)}
                </span>
              </button>
            ))
          )}
        </section>
        <section className="mail-reader">
          {selected ? <Reader message={selected} /> : <div className="empty"><h3>Sin mensaje</h3><p>Elige un correo de la lista.</p></div>}
        </section>
      </div>
      <p className="page-footer">El correo entra por Gmail. Desde aquí no se redacta ni se envía.</p>
    </>
  );
}

function statusLabel(status: MailLogStatus): string {
  if (status === "ingested") return "Ingresado";
  if (status === "discarded") return "Descartado";
  if (status === "pending") return "Pendiente";
  return "Error";
}

function Reader({ message }: { message: MailLogEntry }) {
  const session = useSession();
  const previews = message.invoiceIds
    .map((id) => session.invoices.find((invoice) => invoice.id === id))
    .filter((invoice) => invoice && hasFilePreview(invoice.documentPath));
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>{message.subject || "Sin asunto"}</h2>
          {message.invoiceIds.map((id) => (
            <Link key={id} href={`/facturas/${id}`}>
              Ver factura {id}
            </Link>
          ))}
        </div>
        <span className={`badge ${message.status === "ingested" ? "approved" : message.status === "error" ? "blocked" : "review"}`}>
          {statusLabel(message.status)}
        </span>
      </div>
      <article className="mail-message">
        <header>
          <strong>{message.from}</strong>
          <small>{formatPoll(message.at)}</small>
        </header>
        <small>Entrada de Gmail · {statusLabel(message.status)}</small>
        <p>{message.reason || "El sondeo no dejó un motivo adicional."}</p>
        {message.attachments.length > 0 ? <p>Adjuntos: {message.attachments.join(", ")}</p> : null}
        {previews.map((invoice) => (invoice ? <SyntheticDocument key={invoice.id} invoice={invoice} /> : null))}
      </article>
    </>
  );
}
