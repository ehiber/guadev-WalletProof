"use client";

import { OPENCLAW_DEMO_SECRET } from "@/lib/openclaw/constants";
import { Paperclip, SendHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function allowedFile(file: File): boolean {
  if (ACCEPT.split(",").includes(file.type)) return true;
  return /\.(pdf|png|jpe?g|webp)$/i.test(file.name);
}
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";
const INVOICE_ONLY_REPLY = "Este chat solo recibe facturas. Envía el texto del cobro o adjunta el PDF o la foto.";

type Bubble = {
  id: string;
  role: "out" | "in";
  text: string;
  fileName?: string;
  invoiceId?: string;
};

function receipt(invoiceId: string | undefined): string {
  if (!invoiceId) return "Recibido. Quedó en la bandeja.";
  return `Recibido. Quedó en la bandeja como ${invoiceId}.`;
}

async function filePayload(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export function OpenClawDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([
    {
      id: "welcome",
      role: "in",
      text: "Escríbeme una factura o adjunta el PDF o la foto. Si no es un cobro, no entra a la bandeja.",
    },
  ]);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }, [bubbles, open]);

  if (!open) return null;

  function push(bubble: Bubble) {
    setBubbles((current) => [...current, bubble]);
  }

  async function submit() {
    const message = text.trim();
    const selected = file;
    if (busy || (!message && !selected)) return;
    if (selected && selected.size > MAX_BYTES) {
      push({ id: crypto.randomUUID(), role: "in", text: INVOICE_ONLY_REPLY });
      return;
    }
    if (selected && !allowedFile(selected)) {
      push({ id: crypto.randomUUID(), role: "in", text: INVOICE_ONLY_REPLY });
      return;
    }
    setText("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    push({
      id: crypto.randomUUID(),
      role: "out",
      text: message || selected?.name || "Adjunto",
      fileName: selected?.name,
    });
    setBusy(true);
    try {
      const payload: Record<string, string> = { channel: "whatsapp", text: message };
      if (selected) {
        payload.media = await filePayload(selected);
        payload.mime = selected.type;
        payload.filename = selected.name;
      }
      const response = await fetch("/api/webhooks/openclaw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-openclaw-secret": OPENCLAW_DEMO_SECRET,
        },
        body: JSON.stringify({ kind: "ingest", payload }),
      });
      const body = (await response.json().catch(() => null)) as {
        accepted?: boolean;
        reply?: string;
        invoice?: { id?: string };
      } | null;
      if (body?.accepted === false) {
        push({ id: crypto.randomUUID(), role: "in", text: INVOICE_ONLY_REPLY });
        return;
      }
      if (!response.ok) {
        push({ id: crypto.randomUUID(), role: "in", text: "No se pudo entregar. Reenvía el archivo." });
        return;
      }
      const invoiceId = body?.invoice?.id;
      push({ id: crypto.randomUUID(), role: "in", text: receipt(invoiceId), invoiceId });
    } catch {
      push({ id: crypto.randomUUID(), role: "in", text: "No se pudo entregar. Reenvía el archivo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="drawer wa-drawer" aria-label="Chat de facturas">
      <header className="wa-head">
        <div>
          <h2>Wallet Proof</h2>
          <p className="budget-note">WhatsApp de demo · solo facturas</p>
        </div>
        <button className="btn sm" onClick={onClose} type="button">
          Cerrar
        </button>
      </header>
      <div className="wa-thread" ref={threadRef}>
        {bubbles.map((bubble) => (
          <article className={`wa-bubble ${bubble.role}`} key={bubble.id}>
            {bubble.fileName ? <strong>{bubble.fileName}</strong> : null}
            <p>
              {bubble.invoiceId ? (
                <Link href={`/facturas/${encodeURIComponent(bubble.invoiceId)}`}>{bubble.text}</Link>
              ) : (
                bubble.text
              )}
            </p>
          </article>
        ))}
        {busy ? <p className="wa-pending">Revisando si es una factura…</p> : null}
      </div>
      <form
        className="wa-compose"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <input
          accept={ACCEPT}
          className="visually-hidden"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          ref={fileRef}
          type="file"
        />
        <button aria-label="Adjuntar factura" className="btn sm" onClick={() => fileRef.current?.click()} type="button">
          <Paperclip className="icon" />
        </button>
        <label className="wa-field">
          <span className="visually-hidden">Mensaje</span>
          <textarea
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="Texto de la factura"
            rows={2}
            value={text}
          />
        </label>
        <button aria-label="Enviar" className="btn primary sm" disabled={busy || (!text.trim() && !file)} type="submit">
          <SendHorizontal className="icon" />
        </button>
      </form>
      {file ? <p className="wa-file">{file.name}</p> : null}
    </aside>
  );
}
