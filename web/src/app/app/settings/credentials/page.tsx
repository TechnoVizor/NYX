import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Settings: Credentials" };

export default function Page() {
  return <PlaceholderPage title="Settings: Credentials" description="Workspace configuration." route="/app/settings/credentials" />;
}
