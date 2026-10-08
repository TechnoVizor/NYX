import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return <PlaceholderPage title="Dashboard" description="Workspace overview: recent scans, open findings and what changed." route="/app/dashboard" />;
}
