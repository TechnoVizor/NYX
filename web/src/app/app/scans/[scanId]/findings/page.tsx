import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Scan findings" };

export default async function Page(props: PageProps<"/app/scans/[scanId]/findings">) {
  const { scanId } = await props.params;
  return <PlaceholderPage title={`Scan findings ${scanId}`} route={`/app/scans/${scanId}/findings`} />;
}
