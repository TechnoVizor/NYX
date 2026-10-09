import type { Metadata } from "next";
import { ScanMetrics } from "@/components/scans/scan-metrics";

export const metadata: Metadata = { title: "Scan metrics" };

export default async function Page(props: PageProps<"/app/scans/[scanId]/metrics">) {
  const { scanId } = await props.params;
  return <ScanMetrics id={scanId} />;
}
