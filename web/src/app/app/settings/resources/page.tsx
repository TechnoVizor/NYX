import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Settings: Resources" };

export default function Page() {
  return <PlaceholderPage title="Settings: Resources" description="Workspace configuration." route="/app/settings/resources" />;
}
