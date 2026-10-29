import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return <PlaceholderPage phase="Arrives in Phase 8 — reports build on diff and risk." title="Reports" description="Generated scan reports." route="/app/reports" />;
}
