"use client";

import { useSession } from "@/components/session/session-provider";
import { hasFilePreview, SyntheticDocument } from "@/components/synthetic-document";
import type { MailLogEntry, MailLogStatus } from "@/lib/inbound/types";
import { RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const FOLDERS: Array<{ id: "all" | MailLogStatus; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "ingested", label: "Ingresados" },
  { id: "discarded", label: "Descartados" },
  { id: "error", label: "Con error" },
];

const POLL_NOTE = /sondeo anterior|próximo sondeo/;

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
  const mail = session.mail;
  const busy = session.mailBusy;
  const messages = (mail?.messages ?? []).filter((message) => {
    const inFolder = folder === "all" || message.status === folder;
    const haystack = `${message.subject} ${message.from} ${decisionOf(message, session)}`.toLowerCase();
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
            Envía facturas a {connected ? mail?.address : "ehiberbot@gmail.com"}. Se listan los mensajes de los últimos dos días; esta bandeja no redacta ni envía mensajes.
          </p>
        </div>
        <div className="heading-actions">
          <button className="btn" type="button" disabled={busy} onClick={() => void session.refreshMail()}>
            <RefreshCw className="icon" /> {busy ? "Revisando…" : "Actualizar"}
          </button>
        </div>
      </div>
      <div className="notice info">
        <div>
          <strong>Integración de correo {connected ? "activa" : "configurable"}</strong>
          <p>
            Cada factura enviada a <b>{connected ? mail?.address : "ehiberbot@gmail.com"}</b> se revisa automáticamente. Wallet Proof lee el correo y sus adjuntos PDF o de imagen, crea la factura cuando encuentra datos suficientes y deja el resultado en esta bandeja.
          </p>
        </div>
      </div>
      {mail?.lastError ? (
        <div className="notice error">
          <p>{mail.lastError}</p>
        </div>
      ) : (
        <div className="notice info">
          <p>
            {mail?.lastPollAt ? `Último sondeo ${formatPoll(mail.lastPollAt)}` : "Todavía no hay sondeo."} ·{" "}
            {connected ? "Conectado" : "Desconectado"}
          </p>
        </div>
      )}
      <div className="mail-toolbar">
        <div className="tabs" role="tablist" aria-label="Filtrar correos">
          {FOLDERS.map((item) => {
            const count = (mail?.messages ?? []).filter((message) => item.id === "all" || message.status === item.id).length;
            return (
              <button
                key={item.id}
                className="tab"
                type="button"
                role="tab"
                aria-selected={folder === item.id}
                aria-pressed={folder === item.id}
                onClick={() => {
                  setFolder(item.id);
                  setSelectedId(null);
                }}
              >
                {item.label}
                <span>{count}</span>
              </button>
            );
          })}
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
              <p>Cambia la carpeta o la búsqueda.</p>
            </div>
          ) : (
            <div className="mail-scroll">
            {messages.map((message) => (
              <button
                key={`${message.id}-${message.at}`}
                className={`mail-item${selected?.id === message.id ? " selected" : ""}`}
                type="button"
                onClick={() => setSelectedId(message.id)}
              >
                <strong>{message.subject || "Sin asunto"}</strong>
                <small>{message.from}</small>
                <span>
                  {statusLabel(message.status)} · {formatPoll(message.at)}
                </span>
              </button>
            ))}
            </div>
          )}
        </section>
        <section className="mail-reader">
          {selected ? <Reader message={selected} /> : <div className="empty"><h3>Sin mensaje</h3><p>Elige un correo de la lista.</p></div>}
        </section>
      </div>
    </>
  );
}

function statusLabel(status: MailLogStatus): string {
  if (status === "ingested") return "Ingresado";
  if (status === "discarded") return "Descartado";
  if (status === "pending") return "Pendiente";
  return "Error";
}

function decisionOf(message: MailLogEntry, session: ReturnType<typeof useSession>): string {
  const own = (message.invoices ?? [])
    .map((piece) => piece.reason)
    .filter((reason) => reason && !POLL_NOTE.test(reason));
  if (own.length > 0) return own.join(" ");
  const linked = message.invoiceIds.flatMap((id) => {
    const invoice = session.invoices.find((item) => item.id === id);
    const record = session.records.find((item) => item.invoiceId === id);
    return invoice && record ? [session.explanationOf(invoice, record)] : [];
  });
  if (linked.length > 0) return linked.join(" ");
  if (message.reason && !POLL_NOTE.test(message.reason)) return message.reason;
  if (message.status === "pending") return "Todavía no hay decisión. El motor no ha leído este correo.";
  if (message.status === "error") return "No se pudo leer el correo, así que no hay decisión.";
  if (message.status === "discarded") return "No se ingresó como factura. El motivo concreto no quedó guardado.";
  return "La decisión se tomó antes de empezar a guardarla. A partir del próximo correo, el motivo queda fijo la primera vez que el motor lo emite.";
}

type MailFile = { name: string; mime: string; href: string };

function Reader({ message }: { message: MailLogEntry }) {
  const session = useSession();
  const pieces = message.invoices?.length
    ? message.invoices
    : message.invoiceIds.map((id, index) => ({
        invoiceId: id,
        filename: message.attachments[index] || id,
        reason: message.invoiceIds.length === 1 ? decisionOf(message, session) : "",
      }));
  const needsFiles = pieces.length === 0 || pieces.some((piece) => {
    const invoice = session.invoices.find((item) => item.id === piece.invoiceId);
    return !invoice || !hasFilePreview(invoice.documentPath);
  });
  const files = useMessageFiles(message.id, needsFiles);
  const cards = pieces.length > 0
    ? pieces
    : files.map((file) => ({ invoiceId: "", filename: file.name, reason: "" }));
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>{message.subject || "Sin asunto"}</h2>
        </div>
        <span className={`badge ${message.status === "ingested" ? "approved" : message.status === "error" ? "blocked" : "review"}`}>
          {statusLabel(message.status)}
        </span>
      </div>
      <article className="mail-message">
        <dl className="mail-facts">
          <div>
            <dt>Remitente</dt>
            <dd>{message.from}</dd>
          </div>
          <div>
            <dt>Recibido</dt>
            <dd>{formatPoll(message.at)}</dd>
          </div>
        </dl>
        {cards.length === 0 ? (
          <p className="mail-piece-reason">{decisionOf(message, session)}</p>
        ) : (
          cards.map((piece, index) => {
            const invoice = session.invoices.find((item) => item.id === piece.invoiceId);
            const record = piece.invoiceId ? session.records.find((item) => item.invoiceId === piece.invoiceId) : undefined;
            const reason =
              invoice && record
                ? session.explanationOf(invoice, record)
                : piece.reason ||
                  (cards.length > 1
                    ? "Esta factura se gestiona sola. Su motivo no quedó guardado en este correo."
                    : decisionOf(message, session));
            const file = files.find((item) => item.name === piece.filename) ?? files[index];
            return (
              <section key={`${piece.invoiceId || piece.filename}-${index}`} className="mail-invoice">
                <header>
                  <strong>{piece.filename || `Factura ${index + 1}`}</strong>
                  {piece.invoiceId ? <Link href={`/facturas/${piece.invoiceId}`}>Abrir ficha</Link> : null}
                </header>
                <p>{reason}</p>
                {invoice ? <SyntheticDocument invoice={invoice} /> : file ? <FilePreview file={file} /> : null}
              </section>
            );
          })
        )}
      </article>
    </>
  );
}

function useMessageFiles(id: string, enabled: boolean): MailFile[] {
  const [result, setResult] = useState<{ id: string; files: MailFile[] }>({ id: "", files: [] });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetch(`/api/inbound/gmail/files?message=${encodeURIComponent(id)}`)
      .then((response) => (response.ok ? response.json() : { files: [] }))
      .then((body: { files?: MailFile[] }) => {
        if (!cancelled) setResult({ id, files: body.files ?? [] });
      })
      .catch(() => {
        if (!cancelled) setResult({ id, files: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [id, enabled]);
  return enabled && result.id === id ? result.files : [];
}

function FilePreview({ file }: { file: MailFile }) {
  if (file.mime === "application/pdf") {
    return <iframe title={file.name} src={file.href} className="mail-preview" />;
  }
  if (file.mime.startsWith("image/")) {
    return <img alt={file.name} src={file.href} className="mail-preview" />;
  }
  return null;
}
