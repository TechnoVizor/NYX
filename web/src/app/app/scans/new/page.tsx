import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { NewScanForm } from "@/components/scans/new-scan-form";

export const metadata: Metadata = { title: "New Scan" };

export default async function Page(props: PageProps<"/app/scans/new">) {
  const { profile } = await props.searchParams;
  return (
    <>
      <PageHeader title="New scan" description="A target and a profile. That is all." />
      <NewScanForm initialProfile={typeof profile === "string" ? profile : undefined} />
    </>
  );
}
