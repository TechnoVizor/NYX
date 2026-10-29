import type { Metadata } from "next";
import { ScopeManager } from "@/components/scope/scope-manager";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = { title: "Targets" };

export default function Page() {
  return (
    <>
      <PageHeader title="Targets" description="What I may scan. A domain includes its subdomains." />
      <ScopeManager />
    </>
  );
}
