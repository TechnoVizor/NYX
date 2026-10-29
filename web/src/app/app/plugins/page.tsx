import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { PluginsTable } from "@/components/plugins/plugins-table";

export const metadata: Metadata = { title: "Plugins" };

export default function Page() {
  return (
    <>
      <PageHeader title="Plugins" description="My scanners, each in its own locked-down container." />
      <PluginsTable />
    </>
  );
}
