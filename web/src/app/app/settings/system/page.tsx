import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Settings: System" };

export default function Page() {
  return <PlaceholderPage title="Settings: System" description="Workspace configuration." route="/app/settings/system" />;
}
