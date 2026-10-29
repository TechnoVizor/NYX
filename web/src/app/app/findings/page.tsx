import type { Metadata } from "next";
import { FindingsTable } from "@/components/findings/findings-table";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = { title: "Findings" };

export default async function Page(props: PageProps<"/app/findings">) {
  const searchParams = await props.searchParams;
  return (
    <>
      <PageHeader title="Findings" />
      <FindingsTable searchParams={searchParams} />
    </>
  );
}
