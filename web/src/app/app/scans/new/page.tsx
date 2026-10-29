import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { NewScanForm } from "@/components/scans/new-scan-form";

export const metadata: Metadata = { title: "New Scan" };

export default async function Page(props: PageProps<"/app/scans/new">) {
  const { profile } = await props.searchParams;
  return (
    <>
      <PageHeader title="New scan" description="Pick a target in scope and a profile, or choose plugins by hand. I hand everything I find to every plugin that can use it." />
      <NewScanForm initialProfile={typeof profile === "string" ? profile : undefined} />
    </>
  );
}
