"use client";

import { useSession } from "@/components/session/session-provider";
import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
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
    <>
      <Link href="/" className="back">
        <ArrowLeft className="icon" /> Facturas
      </Link>
      <div className="page-heading">
        <div>
          <h1>Añadir factura</h1>
          <p>Carga el documento y revisa los datos encontrados.</p>
        </div>
      </div>
      <section className="panel upload-panel">
        <h2>Documento de la factura</h2>
        <p>PDF, PNG o JPG sintético. La lectura la hace la capa de visión. Si faltan campos, el motor rechaza la factura.</p>
        <label className="upload-area">
          <strong>
            <FileText className="icon" /> Seleccionar imagen o PDF
          </strong>
          <span>Hasta 4 MB. {name ? `Seleccionado: ${name}` : "Selecciona un archivo o arrástralo a este campo."}</span>
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
        <p id="scan-status" role="status">
          {session.running ? "Leyendo el documento…" : name ? `Listo para revisar ${name}.` : "Sin archivo seleccionado."}
        </p>
        {session.running ? (
          <div className="loading-box" role="status">
            <h3>Revisando la factura…</h3>
            <p>La visión está leyendo el documento. El veredicto lo pone el motor.</p>
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        ) : null}
        {session.liveError ? (
          <div className="notice error">
            <p>{session.liveError}</p>
          </div>
        ) : null}
      </section>
    </>
  );
}
