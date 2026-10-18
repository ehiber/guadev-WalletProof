"use client";

import { INVOICE_FILE_ACCEPT, useSession } from "@/components/session/session-provider";
import { RequiredMark, RequiredNote } from "@/components/ui/ui";
import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewInvoiceView() {
  const session = useSession();
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);

  async function onFiles(files: File[]) {
    if (files.length === 0) return;
    setName(files.map((file) => file.name).join(", "));
    const result = await session.uploadMany(files);
    if (result.added.length === 1) router.push(`/facturas/${result.added[0].id}`);
    else if (result.added.length > 1) router.push("/");
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
        <h2>
          Documento de la factura
          <RequiredMark />
        </h2>
        <RequiredNote />
        <p>PDF, PNG, JPG, WEBP o GIF. Puedes elegir varias a la vez. La lectura la hace la capa de visión. Si faltan campos, el motor rechaza la factura.</p>
        <label className="upload-area">
          <strong>
            <FileText className="icon" /> Seleccionar facturas
          </strong>
          <span>Hasta 4 MB por archivo. {name ? `Seleccionado: ${name}` : "Selecciona uno o varios archivos, o arrástralos a este campo."}</span>
          <input
            type="file"
            multiple
            required
            aria-required="true"
            accept={INVOICE_FILE_ACCEPT}
            disabled={session.running}
            onChange={(event) => {
              const selected = [...(event.target.files ?? [])];
              event.target.value = "";
              void onFiles(selected);
            }}
          />
        </label>
        <p id="scan-status" role="status">
          {session.uploadStatus ?? (session.running ? "Leyendo las facturas…" : name ? `Listo para revisar ${name}.` : "Sin archivo seleccionado.")}
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
