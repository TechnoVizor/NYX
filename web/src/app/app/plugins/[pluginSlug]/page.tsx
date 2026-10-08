import type { Metadata } from "next";
import { PluginDetailView } from "@/components/plugins/plugin-detail";

export const metadata: Metadata = { title: "Plugin" };

export default async function Page(props: PageProps<"/app/plugins/[pluginSlug]">) {
  const { pluginSlug } = await props.params;
  return <PluginDetailView id={decodeURIComponent(pluginSlug)} />;
}
