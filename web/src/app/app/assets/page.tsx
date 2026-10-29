import type { Metadata } from "next";
import { AssetsView } from "@/components/assets/assets-view";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = { title: "Assets" };

export default async function Page(props: PageProps<"/app/assets">) {
  const searchParams = await props.searchParams;
  return (
    <>
      <PageHeader title="Assets" />
      <AssetsView searchParams={searchParams} />
    </>
  );
}
