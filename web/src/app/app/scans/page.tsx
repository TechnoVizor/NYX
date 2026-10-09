import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { ScansTable } from "@/components/scans/scans-table";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Scans" };

export default function Page() {
  return (
    <>
      <PageHeader title="Scans" description="Every scan with what it ran and how it ended." actions={<Link href="/app/scans/new" className={buttonVariants()}>New scan</Link>} />
      <ScansTable />
    </>
  );
}
