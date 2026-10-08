import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Scan Profiles" };

export default function Page() {
  return <PlaceholderPage title="Scan Profiles" description="Reusable scan profiles." route="/app/profiles" />;
}
