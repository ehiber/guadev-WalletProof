"use client";

import { useSession } from "@/components/session/session-provider";
import { Button } from "@/components/ui/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewInvoiceView() {
  const session = useSession();
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setName(file.name);
    const invoice = await session.upload(file);
    if (invoice) router.push(`/facturas/${invoice.id}`);
  }

  return (
    <div>
      <h1 className="text-[32px] leading-tight font-semibold tracking-tight">Añadir factura</h1>
      <p className="mt-2 mb-7 max-w-[72ch] text-[13px] text-muted">
        PDF, PNG o JPG sintético. La lectura la hace la capa de visión; si faltan campos, el motor rechaza la factura.
      </p>
      {session.liveError ? <p className="mb-4 rounded-lg bg-danger-bg px-4 py-3 text-xs text-danger">{session.liveError}</p> : null}
      <label className="flex min-h-[210px] flex-col justify-center gap-3 rounded-xl border border-dashed border-[#8a9ac9] bg-[#f5f7fd] p-7">
        <span className="text-sm font-semibold">Cargar documento</span>
        <span className="text-xs text-muted">Hasta 4 MB. {name ? `Seleccionado: ${name}` : "Ningún archivo todavía."}</span>
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp"
          disabled={session.running}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void onFile(file);
          }}
        />
      </label>
      <Button className="mt-4" type="button" disabled={session.running} onClick={() => void session.runLive(session.invoices.map((invoice) => invoice.id))}>
        {session.running ? "Leyendo…" : "Ejecutar el lote en vivo"}
      </Button>
    </div>
  );
}
