import { renderInvoiceSvg } from "@/lib/demo-document";
import type { Invoice } from "@/types/blinka";

export function SyntheticDocument({ invoice }: { invoice: Invoice }) {
  const path = invoice.documentPath;
  if (path.startsWith("blob:") || path.startsWith("data:")) {
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
