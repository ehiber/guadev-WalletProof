import { redirect } from "next/navigation";

export default function NewProjectPage() {
  redirect("/proyectos?crear=1");
}
