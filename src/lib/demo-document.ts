import type { Invoice } from "@/types/blinka";

function money(invoice: Invoice): string {
  return `${invoice.totalPayable.toLocaleString("en-US")} ${invoice.currency}`;
}

function shell(body: string, width = 640, height = 820): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${body}
</svg>`;
}

export function renderInvoiceSvg(invoice: Invoice): string {
  if (invoice.documentKind === "thermal") {
    return shell(
      `<rect width="420" height="820" fill="#d9d3c7"/>
      <g transform="rotate(-1.4 210 410)">
        <rect x="70" y="36" width="280" height="740" fill="#f7f4ee" stroke="#c8c2b6"/>
        <text x="210" y="78" text-anchor="middle" font-family="ui-monospace, monospace" font-size="18" fill="#222">CLOUDNOVA POS</text>
        <text x="210" y="102" text-anchor="middle" font-family="ui-monospace, monospace" font-size="12" fill="#444">TICKET SINTETICO</text>
        <text x="90" y="150" font-family="ui-monospace, monospace" font-size="13" fill="#222">${invoice.invoiceNumber}</text>
        <text x="90" y="176" font-family="ui-monospace, monospace" font-size="13" fill="#222">${invoice.issueDate}</text>
        <text x="90" y="230" font-family="ui-monospace, monospace" font-size="13" fill="#222">${invoice.lineItems[0] ?? ""}</text>
        <text x="90" y="290" font-family="ui-monospace, monospace" font-size="16" fill="#111">TOTAL ${money(invoice)}</text>
        <text x="90" y="330" font-family="ui-monospace, monospace" font-size="11" fill="#555">MISMA REF QUE INV-01</text>
      </g>`,
      420,
      820,
    );
  }

  if (invoice.documentKind === "handwritten") {
    return shell(
      `<rect width="640" height="820" fill="#efe6d6"/>
      <rect x="48" y="40" width="544" height="740" fill="#fffaf1" stroke="#e2d3b8"/>
      <text x="80" y="120" font-family="Segoe Script, cursive" font-size="28" fill="#243f73">Carlos Méndez</text>
      <text x="80" y="160" font-family="Segoe Script, cursive" font-size="18" fill="#3d4d73">Refrigeración y Eléctricos</text>
      <text x="80" y="250" font-family="Segoe Script, cursive" font-size="22" fill="#1d2744">${invoice.description}</text>
      <text x="80" y="340" font-family="Segoe Script, cursive" font-size="32" fill="#1d2744">Total ${money(invoice)}</text>
      <text x="80" y="400" font-family="Segoe Script, cursive" font-size="16" fill="#667">${invoice.issueDate}</text>`,
    );
  }

  if (invoice.documentKind === "chat") {
    return shell(
      `<rect width="640" height="820" fill="#0b141a"/>
      <rect x="0" y="0" width="640" height="72" fill="#1f2c34"/>
      <text x="32" y="44" fill="#e9edef" font-family="ui-sans-serif, sans-serif" font-size="18">AndesSoft Devs</text>
      <rect x="48" y="120" width="420" height="150" rx="12" fill="#005c4b"/>
      <text x="68" y="160" fill="#e9edef" font-family="ui-sans-serif, sans-serif" font-size="16">Urgente: hay que pagar hoy</text>
      <text x="68" y="190" fill="#e9edef" font-family="ui-sans-serif, sans-serif" font-size="16">${money(invoice)}</text>
      <text x="68" y="230" fill="#d1fae5" font-family="ui-sans-serif, sans-serif" font-size="15">Cuenta nueva ••••3310</text>
      <text x="68" y="280" fill="#8aa" font-family="ui-sans-serif, sans-serif" font-size="13">La cuenta del contrato es ••••7788</text>`,
    );
  }

  return shell(
    `<rect width="640" height="820" fill="#f4f6f8"/>
    <rect x="36" y="28" width="568" height="764" fill="#ffffff" stroke="#d8dee8"/>
    <rect x="36" y="28" width="568" height="74" fill="#121826"/>
    <text x="60" y="72" fill="#ffffff" font-family="ui-sans-serif, sans-serif" font-size="20">${invoice.vendorName}</text>
    <text x="60" y="150" fill="#5c6575" font-family="ui-sans-serif, sans-serif" font-size="13">DOCUMENTO SINTETICO · ${invoice.id}</text>
    <text x="60" y="190" fill="#121826" font-family="ui-sans-serif, sans-serif" font-size="16">${invoice.invoiceNumber}</text>
    <text x="60" y="214" fill="#5c6575" font-family="ui-sans-serif, sans-serif" font-size="13">${invoice.issueDate}</text>
    <text x="60" y="280" fill="#121826" font-family="ui-sans-serif, sans-serif" font-size="16">${invoice.description}</text>
    <text x="60" y="360" fill="#5c6575" font-family="ui-sans-serif, sans-serif" font-size="14">Subtotal</text>
    <text x="520" y="360" text-anchor="end" fill="#121826" font-family="ui-sans-serif, sans-serif" font-size="14">${invoice.subtotal.toLocaleString("en-US")} ${invoice.currency}</text>
    <text x="60" y="390" fill="#5c6575" font-family="ui-sans-serif, sans-serif" font-size="14">Impuesto</text>
    <text x="520" y="390" text-anchor="end" fill="#121826" font-family="ui-sans-serif, sans-serif" font-size="14">${invoice.taxAmount.toLocaleString("en-US")} ${invoice.currency}</text>
    <text x="60" y="440" fill="#121826" font-family="ui-sans-serif, sans-serif" font-size="18">Total a pagar</text>
    <text x="520" y="440" text-anchor="end" fill="#121826" font-family="ui-sans-serif, sans-serif" font-size="18">${money(invoice)}</text>`,
  );
}
