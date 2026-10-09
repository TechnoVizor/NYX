import type { Metadata } from "next";
import { ScanOverview } from "@/components/scans/scan-overview";

export const metadata: Metadata = { title: "Scan" };

export default async function Page(props: PageProps<"/app/scans/[scanId]">) {
  const { scanId } = await props.params;
  return <ScanOverview id={scanId} />;
}
