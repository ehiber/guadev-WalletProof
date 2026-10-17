"use client";

import { DetailView } from "@/components/views/detail-view";
import { useParams } from "next/navigation";

export default function InvoicePage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <DetailView id={id} />;
}
