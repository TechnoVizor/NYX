import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Plugins" };

export default function Page() {
  return <PlaceholderPage title="Plugins" description="Plugin registry: installed, available and updates." route="/app/plugins" />;
}
