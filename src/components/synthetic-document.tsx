import { renderInvoiceSvg } from "@/lib/demo-document";
import type { Invoice } from "@/types/blinka";

export function hasFilePreview(path: string): boolean {
  return path.startsWith("blob:") || path.startsWith("data:") || path.startsWith("/api/documents/");
}

export function DocumentThumb({ invoice }: { invoice: Invoice }) {
  const path = invoice.documentPath;
  if (!hasFilePreview(path)) return null;
  if (invoice.documentKind === "pdf") {
    return (
      <iframe
        title={invoice.id}
        src={path}
        className="pointer-events-none h-10 w-10 shrink-0 rounded border border-[#e6e8ee] bg-white"
      />
    );
  }
  return (
    <img alt="" src={path} className="h-10 w-10 shrink-0 rounded border border-[#e6e8ee] bg-white object-cover" />
  );
}

export function SyntheticDocument({ invoice }: { invoice: Invoice }) {
  const path = invoice.documentPath;
  if (path) {
    if (invoice.documentKind === "pdf") {
      return <iframe title={invoice.id} src={path} className="h-80 w-full rounded-lg border border-[#e6e8ee] bg-white" />;
    }
    return (
      <img
        alt={invoice.documentLabel}
        src={path}
        className="max-h-80 w-full rounded-lg border border-[#e6e8ee] bg-white object-contain"
      />
    );
  }
  const svg = renderInvoiceSvg(invoice).replace(/^<\?xml[^>]*>\s*/, "");
  return (
    <div
      className="overflow-hidden rounded-lg border border-[#e6e8ee] bg-white [&_svg]:h-auto [&_svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
