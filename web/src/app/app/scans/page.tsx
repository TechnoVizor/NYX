import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Scans" };

export default function Page() {
  return <PlaceholderPage title="Scans" description="All scans with status, profile, cost and change summary." route="/app/scans" />;
}
