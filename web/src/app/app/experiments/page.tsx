import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Experiments" };

export default function Page() {
  return <PlaceholderPage title="Experiments" description="Compare fixed and adaptive orchestration, and graph backends." route="/app/experiments" />;
}
