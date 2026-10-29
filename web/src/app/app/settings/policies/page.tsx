import { redirect } from "next/navigation";

// Scope moved to Targets; old links keep working.
export default function Page() {
  redirect("/app/targets");
}
