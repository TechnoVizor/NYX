import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Experiments" };

export default function Page() {
  return <PlaceholderPage phase="Arrives in Phase 9 — reproducible runs against the lab testbed." title="Experiments" description="Compare fixed and adaptive orchestration, and graph backends." route="/app/experiments" />;
}
