"use client";

import { useSession } from "@/components/session/session-provider";
import { statusLabel, usd, vendorDisplay } from "@/lib/format";
import { Download, FileText } from "lucide-react";
import Link from "next/link";

export function ActivityView() {
  const session = useSession();
  const events = [...session.records].reverse();

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Registro de decisiones</h1>
          <p>Qué ocurrió, con qué reglas y quién tomó la decisión.</p>
        </div>
        <div className="heading-actions">
          <button className="btn" type="button" onClick={session.exportCsv}>
            <Download className="icon" /> Exportar CSV
          </button>
        </div>
      </div>
      <div className="notice info">
        <p>Cada decisión conserva sus condiciones. El hash cambia si cambia la configuración, no el método.</p>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>{events.length} eventos registrados</h2>
          <span className="small muted">Más recientes primero</span>
        </div>
        <div className="timeline">
          {events.map((record) => {
            const invoice = session.invoices.find((item) => item.id === record.invoiceId);
            const status = session.statusOf(record);
            const snapshot = {
              invoiceId: record.invoiceId,
              status,
              totalPayableUsd: record.totalPayableUsd,
              auditHash: record.auditHash,
              explanation: invoice ? session.explanationOf(invoice, record) : record.explanation,
            };
            return (
              <article key={record.invoiceId} className="timeline-item">
                <span className="timeline-icon">
                  <FileText className="icon" />
                </span>
                <div>
                  <h3>
                    <Link href={`/facturas/${record.invoiceId}`}>
                      {record.invoiceId} · {statusLabel(status)}
                    </Link>
                  </h3>
                  <p>{invoice ? vendorDisplay(invoice.vendorId, invoice.vendorName) : record.invoiceId}. {snapshot.explanation}</p>
                  <details>
                    <summary>
                      {record.invoiceId} · Ver registro
                    </summary>
                    <pre>{JSON.stringify(snapshot, null, 2)}</pre>
                  </details>
                </div>
                <time>{usd(record.totalPayableUsd)}</time>
              </article>
            );
          })}
        </div>
      </section>
      <p className="page-footer">El registro vive en esta sesión. Exportar CSV descarga el lote actual.</p>
    </>
  );
}
