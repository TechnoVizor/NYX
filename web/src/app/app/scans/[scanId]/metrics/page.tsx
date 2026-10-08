import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Scan metrics" };

export default async function Page(props: PageProps<"/app/scans/[scanId]/metrics">) {
  const { scanId } = await props.params;
  return <PlaceholderPage title={`Scan metrics ${scanId}`} route={`/app/scans/${scanId}/metrics`} />;
}
