import type { Metadata } from "next";
import { HomeView } from "@/components/home/home-view";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = { title: "Home" };

export default function Page() {
  return (
    <>
      <PageHeader title="Home" />
      <HomeView />
    </>
  );
}
