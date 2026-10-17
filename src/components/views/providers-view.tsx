"use client";

import { useSession } from "@/components/session/session-provider";
import { vendorDisplay, vendorInitials } from "@/lib/format";
import { ArrowLeft, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export function ProvidersView() {
  const session = useSession();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "authorized" | "pending">("all");
  const visible = useMemo(
    () =>
      session.vendors.filter((vendor) => {
        const status = vendor.active ? "authorized" : "pending";
        const matches = filter === "all" || filter === status;
        const haystack = `${vendorDisplay(vendor.id, vendor.legalName)} ${vendor.country}`.toLowerCase();
        return matches && haystack.includes(query.trim().toLowerCase());
      }),
    [filter, query, session.vendors],
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Proveedores</h1>
          <p>Acuerdos, monedas y lista autorizada en un solo lugar.</p>
        </div>
        <span className="badge neutral">Lista del sandbox</span>
      </div>
      <div className="notice info">
        <p>Autorizar un proveedor permite evaluar sus facturas según las reglas. Los duplicados, cambios de cuenta y límites siguen revisándose.</p>
      </div>
      <section className="table-card" aria-label="Proveedores">
        <div className="table-toolbar">
          <label className="search">
            <Search className="icon" />
            <span className="visually-hidden">Buscar proveedor</span>
            <input type="search" value={query} placeholder="Buscar proveedor" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <label className="field" style={{ margin: 0, minWidth: 180 }}>
            <span className="visually-hidden">Estado</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
              <option value="all">Todos</option>
              <option value="authorized">Autorizado</option>
              <option value="pending">Sin registrar</option>
            </select>
          </label>
        </div>
        {visible.length === 0 ? (
          <div className="empty">
            <h2>No hay proveedores que coincidan</h2>
            <p>Cambia el estado o la búsqueda.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Proveedor</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Monedas</th>
                  <th scope="col">Servicio acordado</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((vendor) => {
                  const currencies = [
                    ...new Set(session.invoices.filter((invoice) => invoice.vendorId === vendor.id).map((invoice) => invoice.currency)),
                  ];
                  return (
                    <tr key={vendor.id}>
                      <td>
                        <div className="vendor-cell">
                          <span className="vendor-icon">{vendorInitials(vendor.id, vendor.legalName)}</span>
                          <div>
                            <strong>{vendorDisplay(vendor.id, vendor.legalName)}</strong>
                            <small>{vendor.country}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${vendor.active ? "approved" : "review"}`}>{vendor.active ? "Autorizado" : "Sin registrar"}</span>
                      </td>
                      <td>{currencies.length > 0 ? currencies.join(", ") : "—"}</td>
                      <td>{vendor.contractSummary}</td>
                      <td>
                        <Link className="btn sm" href={`/proveedores/${vendor.id}`}>
                          Ver ficha
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="page-footer">Una cuenta nueva solo se agrega al aprobar una excepción de cuenta.</p>
    </>
  );
}

export function ProviderDetailView({ id }: { id: string }) {
  const session = useSession();
  const vendor = session.vendors.find((item) => item.id === id);
  const invoices = session.invoices.filter((invoice) => invoice.vendorId === id);
  if (!vendor) {
    return (
      <>
        <Link href="/proveedores" className="back">
          <ArrowLeft className="icon" /> Proveedores
        </Link>
        <h1>Proveedor no encontrado</h1>
      </>
    );
  }
  return (
    <>
      <Link href="/proveedores" className="back">
        <ArrowLeft className="icon" /> Proveedores
      </Link>
      <div className="page-heading">
        <div>
          <h1>{vendorDisplay(vendor.id, vendor.legalName)}</h1>
          <p>{vendor.active ? "Autorizado" : "Sin registrar"} · {vendor.country}</p>
        </div>
        <span className={`badge ${vendor.active ? "approved" : "review"}`}>{vendor.active ? "Autorizado" : "Sin registrar"}</span>
      </div>
      <div className="rules-layout">
        <section className="panel">
          <h2>Acuerdo y datos de cobro</h2>
          <p>La ficha sale del dataset. No se edita desde aquí.</p>
          <label className="field">
            <span>País</span>
            <input readOnly value={vendor.country} />
          </label>
          <label className="field">
            <span>Servicio acordado</span>
            <textarea readOnly value={vendor.contractSummary} />
          </label>
          <label className="field">
            <span>Centro de costo</span>
            <input readOnly value={vendor.costCenter} />
          </label>
          <label className="field">
            <span>Cuenta del contrato</span>
            <input readOnly value={vendor.accounts[0] ?? "Sin cuenta"} />
          </label>
        </section>
        <div>
          <section className="panel">
            <h2>Cuentas</h2>
            <ul>
              {vendor.accounts.map((account, index) => (
                <li key={`${account}-${index}`} className="bank-row">
                  <strong>{account}</strong>
                  <p>{index === 0 ? "Cuenta registrada en el contrato." : "Añadida al aprobar la excepción. La anterior se conserva."}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <h2>Facturas</h2>
            {invoices.length === 0 ? <p>Este proveedor no tiene facturas en la sesión.</p> : null}
            <ul>
              {invoices.map((invoice) => {
                const record = session.records.find((item) => item.invoiceId === invoice.id);
                return (
                  <li key={invoice.id} className="provider-note">
                    <Link href={`/facturas/${invoice.id}`}>
                      {invoice.id} · {invoice.invoiceNumber}
                    </Link>
                    <p>{record ? session.explanationOf(invoice, record) : invoice.description}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
