import { SyntheticDocument } from "@/components/synthetic-document";
import { INITIAL_DATASET } from "@/lib/mock-data/initial-dataset";
import Link from "next/link";

export default function InvoiceGeneratorPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <p className="text-sm text-[#5c6575]">
        <Link href="/">Volver al sandbox</Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#121826]">Generador de facturas sintéticas</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5c6575]">
        Ocho documentos ficticios para la demo. No usan recibos reales ni datasets públicos.
      </p>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {INITIAL_DATASET.map((invoice) => (
          <article key={invoice.id} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium text-[#121826]">
                {invoice.id} · {invoice.documentLabel}
              </h2>
              <a className="btn" href={invoice.documentPath} download>
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
