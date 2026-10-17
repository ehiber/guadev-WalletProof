import Link from "next/link";

const STEPS = [
  { href: "/", title: "Facturas", text: "Pagado, Por revisar y Rechazado salen del motor. El total en USD es el del registro, no un cálculo de la pantalla." },
  { href: "/reglas", title: "Reglas", text: "Cada criterio puede escalar o rechazar. El cambio recalcula el lote al momento. Con la configuración inicial, la matriz de aceptación no se mueve." },
  { href: "/facturas/INV-07", title: "INV-07", text: "Con la anomalía alta en Rechazado no hay botón de aprobar. Si la mueves a Por revisar, aprobar agrega la cuenta nueva y conserva la anterior." },
  { href: "/proveedores", title: "Proveedores", text: "La ficha muestra el contrato y las cuentas de la sesión. No sustituye la lista del dataset." },
  { href: "/correo", title: "Correo", text: "Muestra el sondeo de Gmail. No redacta, no reenvía y no entrega mensajes." },
  { href: "/tasas", title: "Tasas", text: "Lee el libro sintético del día de demo. Una cotización externa no cambia el veredicto." },
];

export function HelpView() {
  return (
    <div>
      <h1 className="text-[32px] leading-tight font-semibold tracking-tight">Ayuda</h1>
      <p className="mt-2 mb-6 max-w-[72ch] text-[13px] text-muted">
        Sandbox de NovaLatam. Los documentos son sintéticos y el estado vive en memoria. Restaurar, en la cabecera, vuelve al lote y a las reglas iniciales.
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        {STEPS.map((step) => (
          <article key={step.href} className="border-b border-line py-4">
            <h2 className="text-[15px] font-semibold">{step.title}</h2>
            <p className="mt-1.5 mb-3 text-xs text-muted">{step.text}</p>
            <Link href={step.href} className="text-[11px] font-semibold text-accent no-underline">
              Abrir
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
