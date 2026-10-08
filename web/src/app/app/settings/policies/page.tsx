import type { Metadata } from "next";
import { ScopeManager } from "@/components/scope/scope-manager";

export const metadata: Metadata = { title: "Settings: Scope" };

export default function Page() {
  return <ScopeManager />;
}
