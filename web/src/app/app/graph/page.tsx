import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Graph" };

export default function Page() {
  return <PlaceholderPage phase="Arrives in Phase 5 — needs the entity graph in Memgraph." title="Graph" description="Temporal attack-surface graph." route="/app/graph" />;
}
