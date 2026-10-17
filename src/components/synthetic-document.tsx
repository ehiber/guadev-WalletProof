import { renderInvoiceSvg } from "@/lib/demo-document";
import type { Invoice } from "@/types/blinka";

export function SyntheticDocument({ invoice }: { invoice: Invoice }) {
  const svg = renderInvoiceSvg(invoice).replace(/^<\?xml[^>]*>\s*/, "");
  return (
    <div
      className="overflow-hidden rounded-lg border border-[#e6e8ee] bg-white [&_svg]:h-auto [&_svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
