import type { Metadata } from "next";
import { FindingDetail } from "@/components/findings/finding-detail";

export const metadata: Metadata = { title: "Finding" };

export default async function Page(props: PageProps<"/app/findings/[findingId]">) {
  const { findingId } = await props.params;
  return <FindingDetail id={findingId} />;
}
