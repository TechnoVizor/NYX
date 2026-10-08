import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Settings: AI" };

export default function Page() {
  return <PlaceholderPage title="Settings: AI" description="Workspace configuration." route="/app/settings/ai" />;
}
