import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Scan graph" };

export default async function Page(props: PageProps<"/app/scans/[scanId]/graph">) {
  const { scanId } = await props.params;
  return <PlaceholderPage phase="Arrives in Phase 5 — needs the entity graph in Memgraph." title={`Scan graph ${scanId}`} route={`/app/scans/${scanId}/graph`} />;
}
