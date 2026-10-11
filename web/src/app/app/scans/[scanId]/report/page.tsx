import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Scan report" };

export default async function Page(props: PageProps<"/app/scans/[scanId]/report">) {
  const { scanId } = await props.params;
  return <PlaceholderPage phase="Arrives in Phase 8 — reports build on diff and risk." title={`Scan report ${scanId}`} route={`/app/scans/${scanId}/report`} />;
}
