import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Settings: Workspace" };

export default function Page() {
  return <PlaceholderPage title="Settings: Workspace" description="Workspace configuration." route="/app/settings/workspace" />;
}
