"use client";

import { ProjectView } from "@/components/views/project-view";
import { useParams } from "next/navigation";

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <ProjectView id={id} />;
}
