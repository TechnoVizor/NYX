import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Findings" };

export default function Page() {
  return <PlaceholderPage title="Findings" description="Evidence-linked findings across all scans." route="/app/findings" />;
}
