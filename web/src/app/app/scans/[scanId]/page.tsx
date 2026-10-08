import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Scan" };

export default async function Page(props: PageProps<"/app/scans/[scanId]">) {
  const { scanId } = await props.params;
  return <PlaceholderPage title={`Scan ${scanId}`} route={`/app/scans/${scanId}`} />;
}
