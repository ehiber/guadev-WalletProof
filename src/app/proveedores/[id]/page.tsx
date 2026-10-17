"use client";

import { ProviderDetailView } from "@/components/views/providers-view";
import { useParams } from "next/navigation";

export default function ProviderPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <ProviderDetailView id={id} />;
}
