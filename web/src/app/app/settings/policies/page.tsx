import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Settings: Policies" };

export default function Page() {
  return <PlaceholderPage title="Settings: Policies" description="Workspace configuration." route="/app/settings/policies" />;
}
