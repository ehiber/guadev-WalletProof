"use client";

import { useSession } from "@/components/session/session-provider";
import { vendorInitials } from "@/lib/format";
import Link from "next/link";

export function ProvidersView() {
  const session = useSession();
  return (
    <div>
      <h1 className="text-[32px] leading-tight font-semibold tracking-tight">Proveedores</h1>
      <p className="mt-2 mb-7 text-[13px] text-muted">Lista autorizada del sandbox. Las cuentas nuevas solo se agregan al aprobar una excepción de cuenta.</p>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <ul>
          {session.vendors.map((vendor) => (
            <li key={vendor.id} className="border-t border-[#edf0f6] first:border-0">
              <Link href={`/proveedores/${vendor.id}`} className="flex items-center gap-3 px-4 py-4 text-ink no-underline hover:bg-[#f7f8fc]">
                <span className="grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-[#eef1f7] text-[10px] font-semibold text-muted">
                  {vendorInitials(vendor.id, vendor.legalName)}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-xs">{vendor.legalName}</strong>
                  <small className="text-[10px] text-muted">
                    {vendor.country} · {vendor.costCenter} · {vendor.accounts.length} cuenta{vendor.accounts.length === 1 ? "" : "s"}
                  </small>
                </span>
                <span className={`rounded-[5px] px-1.5 py-1 text-[10px] font-semibold ${vendor.active ? "bg-approved-bg text-approved" : "bg-warn-bg text-warn"}`}>
                  {vendor.active ? "Autorizado" : "Sin registrar"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ProviderDetailView({ id }: { id: string }) {
  const session = useSession();
  const vendor = session.vendors.find((item) => item.id === id);
  const invoices = session.invoices.filter((invoice) => invoice.vendorId === id);
  if (!vendor) {
    return (
      <div>
        <Link href="/proveedores" className="text-xs text-accent no-underline">Proveedores</Link>
        <h1 className="mt-4 text-2xl font-semibold">Proveedor no encontrado</h1>
      </div>
    );
  }
  return (
    <div>
      <Link href="/proveedores" className="text-xs text-accent no-underline">Proveedores</Link>
      <h1 className="mt-4 text-[28px] leading-tight font-semibold tracking-tight">{vendor.legalName}</h1>
      <p className="mt-2 max-w-[72ch] text-[13px] text-muted">{vendor.contractSummary}</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">Cuentas</h2>
          <ul className="mt-4 space-y-3">
            {vendor.accounts.map((account, index) => (
              <li key={`${account}-${index}`} className="border-b border-line pb-3 text-xs last:border-0">
                <strong className="block">{account}</strong>
                <small className="text-[10px] text-muted">{index === 0 ? "Cuenta registrada en el contrato" : "Añadida al aprobar la excepción. La anterior se conserva."}</small>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">Facturas</h2>
          <ul className="mt-4 space-y-3">
            {invoices.map((invoice) => {
              const record = session.records.find((item) => item.invoiceId === invoice.id);
              return (
                <li key={invoice.id}>
                  <Link href={`/facturas/${invoice.id}`} className="text-xs font-semibold text-accent no-underline">
                    {invoice.id} · {invoice.invoiceNumber}
                  </Link>
                  <p className="text-[11px] text-muted">{record ? session.explanationOf(invoice, record) : invoice.description}</p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
