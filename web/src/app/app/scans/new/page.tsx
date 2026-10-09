import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { NewScanForm } from "@/components/scans/new-scan-form";

export const metadata: Metadata = { title: "New Scan" };

export default function Page() {
  return (
    <>
      <PageHeader title="New scan" description="Pick a target in scope and the plugins to run. I hand everything I find to every plugin that can use it." />
      <NewScanForm />
    </>
  );
}
