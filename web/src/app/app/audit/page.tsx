import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Audit Log" };

export default function Page() {
  return <PlaceholderPage title="Audit Log" description="Who ran what, against which scope." route="/app/audit" />;
}
