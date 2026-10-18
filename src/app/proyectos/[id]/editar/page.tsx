"use client";

import { ProjectCreateView } from "@/components/views/project-form";
import { useParams } from "next/navigation";

export default function EditProjectPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <ProjectCreateView projectId={id} />;
}
