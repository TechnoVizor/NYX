import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Assets" };

export default function Page() {
  return <PlaceholderPage title="Assets" description="Domains, hosts, services and endpoints discovered so far." route="/app/assets" />;
}
