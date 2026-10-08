import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Scan live" };

export default async function Page(props: PageProps<"/app/scans/[scanId]/live">) {
  const { scanId } = await props.params;
  return <PlaceholderPage title={`Scan live ${scanId}`} route={`/app/scans/${scanId}/live`} />;
}
