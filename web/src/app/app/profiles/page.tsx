import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ProfilesView } from "@/components/profiles/profiles-view";

export const metadata: Metadata = { title: "Scan Profiles" };

export default function Page() {
  return (
    <>
      <PageHeader title="Scan profiles" description="Saved sets of plugins and depth." />
      <ProfilesView />
    </>
  );
}
