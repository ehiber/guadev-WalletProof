import { SyntheticDocument } from "@/components/synthetic-document";
import { INITIAL_DATASET } from "@/lib/mock-data/initial-dataset";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function InvoiceGeneratorPage() {
  return (
    <main>
      <div className="page-heading">
        <div>
          <p>
            <Link className="back" href="/">
              <ArrowLeft className="icon" /> Volver al sandbox
            </Link>
          </p>
          <h1>Generador de facturas sintéticas</h1>
          <p>Ocho documentos ficticios para la demo. No usan recibos reales ni datasets públicos.</p>
        </div>
      </div>
      <div className="guide-grid">
        {INITIAL_DATASET.map((invoice) => (
          <article key={invoice.id} className="panel">
            <div className="section-heading">
              <h2>
                {invoice.id} · {invoice.documentLabel}
              </h2>
              <a className="btn sm" href={invoice.documentPath} download>
                Descargar SVG
              </a>
            </div>
            <SyntheticDocument invoice={invoice} />
          </article>
        ))}
      </div>
    </main>
  );
}
