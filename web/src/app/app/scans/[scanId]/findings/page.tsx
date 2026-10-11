import type { Metadata } from "next";
import { FindingsTable } from "@/components/findings/findings-table";

export const metadata: Metadata = { title: "Scan findings" };

export default async function Page(props: PageProps<"/app/scans/[scanId]/findings">) {
  const { scanId } = await props.params;
  return <FindingsTable scanId={scanId} />;
}
