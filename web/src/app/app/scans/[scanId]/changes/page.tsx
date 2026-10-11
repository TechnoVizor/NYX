import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Scan changes" };

export default async function Page(props: PageProps<"/app/scans/[scanId]/changes">) {
  const { scanId } = await props.params;
  return <PlaceholderPage phase="Arrives in Phase 8 — needs scan-to-scan diff." title={`Scan changes ${scanId}`} route={`/app/scans/${scanId}/changes`} />;
}
