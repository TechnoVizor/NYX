import type { Metadata } from "next";
import { ScopeManager } from "@/components/scope/scope-manager";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = { title: "Targets" };

export default function Page() {
  return (
    <>
      <PageHeader title="Targets" description="What you allow me to scan, and who allowed it. A domain covers itself and its subdomains; plugins that send traffic need active scanning allowed." />
      <ScopeManager />
    </>
  );
}
