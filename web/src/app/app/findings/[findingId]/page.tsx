import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Finding" };

export default async function Page(props: PageProps<"/app/findings/[findingId]">) {
  const { findingId } = await props.params;
  return <PlaceholderPage title={`Finding ${findingId}`} route={`/app/findings/${findingId}`} />;
}
