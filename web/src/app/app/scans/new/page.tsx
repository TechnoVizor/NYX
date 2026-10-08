import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "New Scan" };

export default function Page() {
  return <PlaceholderPage title="New Scan" description="Five-step builder: target, profile, plugins, scope and budget, review." route="/app/scans/new" />;
}
