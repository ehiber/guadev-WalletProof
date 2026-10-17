"use client";

import { useSession } from "@/components/session/session-provider";
import { ArrowRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const STEPS = [
  {
    href: "/facturas/INV-02",
    title: "1. Una decisión autónoma",
    text: "Abre la factura en COP. El total equivalente es el del registro: 1.680.000 / 4.200 = 400 USD.",
    cta: "Ver caso multimoneda",
  },
  {
    href: "/facturas/INV-03",
    title: "2. Una excepción entendible",
    text: "El subtotal no manda. El total con impuestos es 533.60 USD y queda por revisar.",
    cta: "Revisar excepción",
  },
  {
    href: "/facturas/INV-05",
    title: "3. Un cobro que debe frenarse",
    text: "La misma referencia aparece otra vez. El duplicado se rechaza y no hay botón de aprobación.",
    cta: "Ver duplicado",
  },
  {
    href: "/reglas",
    title: "4. Reglas con impacto visible",
    text: "Mueve un criterio o cambia el límite. El lote se recalcula al momento y el registro conserva el hash nuevo.",
    cta: "Abrir reglas",
  },
];

export function HelpView() {
  const session = useSession();
  const [demo, setDemo] = useState<"ready" | "loading" | "error" | "empty">("ready");

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Una demo que se puede explicar</h1>
          <p>Recorrido sugerido para mostrar el sandbox de NovaLatam.</p>
        </div>
        <div className="heading-actions">
          <button className="btn" type="button" onClick={session.reset}>
            <RotateCcw className="icon" /> Restaurar ejemplos
          </button>
        </div>
      </div>
      <div className="guide-grid">
        <section className="panel">
          <h2>Del control a la decisión</h2>
          {STEPS.map((step) => (
            <div key={step.href} className="guide-step">
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <Link className="btn" href={step.href}>
                {step.cta} <ArrowRight className="icon" />
              </Link>
            </div>
          ))}
        </section>
        <div>
          <section className="panel">
            <h2>Qué demuestra este sandbox</h2>
            <p>
              Las reglas duras deciden en código. JEV solo se consulta si esas reglas pasan. Los documentos son sintéticos y el estado vive en memoria.
            </p>
            <h3>Estados para revisar</h3>
            <div className="button-row">
              <button className="btn sm" type="button" onClick={() => setDemo("loading")}>
                Carga
              </button>
              <button className="btn sm" type="button" onClick={() => setDemo("error")}>
                Error
              </button>
              <button className="btn sm" type="button" onClick={() => setDemo("empty")}>
                Sin resultados
              </button>
            </div>
            <div id="state-preview">
              {demo === "loading" ? (
                <div className="loading-box" role="status">
                  <h3>Revisando la factura…</h3>
                  <p>Estado ilustrativo de carga. No hay una llamada en curso.</p>
                  <div className="skeleton" />
                  <div className="skeleton" />
                </div>
              ) : null}
              {demo === "error" ? (
                <div className="notice error" role="alert">
                  <p>
                    <strong>No pudimos completar la revisión</strong>
                    La decisión anterior se conserva.
                  </p>
                </div>
              ) : null}
              {demo === "empty" ? (
                <div className="empty">
                  <h3>No hay facturas que coincidan</h3>
                  <p>Elimina la búsqueda o cambia el filtro.</p>
                </div>
              ) : null}
              {demo === "ready" ? <p className="budget-note">Elige un estado para ver cómo se presenta.</p> : null}
            </div>
          </section>
          <section className="panel">
            <h2>Lo que no hace esta pantalla</h2>
            <p>El correo muestra el sondeo de Gmail y no envía mensajes. El veredicto usa el libro sintético: USD, EUR, BRL, ARS, PEN, CRC, COP, MXN, CLP, BOB, ZAR y VES, más BTC, ETH, USDT y USDC. USDC cubre Base, Ethereum, Polygon, Celo y Solana con la misma tasa. Consultar el día solo muestra una referencia. Restaurar vuelve al lote y a las reglas iniciales.</p>
          </section>
        </div>
      </div>
    </>
  );
}
