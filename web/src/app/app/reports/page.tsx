import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return <PlaceholderPage title="Reports" description="Generated scan reports." route="/app/reports" />;
}
