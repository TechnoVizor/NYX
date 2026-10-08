import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Scan evidence" };

export default async function Page(props: PageProps<"/app/scans/[scanId]/evidence">) {
  const { scanId } = await props.params;
  return <PlaceholderPage title={`Scan evidence ${scanId}`} route={`/app/scans/${scanId}/evidence`} />;
}
