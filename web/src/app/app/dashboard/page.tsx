import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { PageHeader } from "@/components/shared/page-header";
import { QuickScan } from "@/components/scans/quick-scan";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <>
      <PageHeader title="Dashboard" description="What is open, what is new, and where it sits." />
      <div className="flex flex-col gap-8">
        <QuickScan />
        <DashboardView />
      </div>
    </>
  );
}
