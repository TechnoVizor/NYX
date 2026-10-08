import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Plugin" };

export default async function Page(props: PageProps<"/app/plugins/[pluginSlug]">) {
  const { pluginSlug } = await props.params;
  return <PlaceholderPage title={`Plugin ${pluginSlug}`} route={`/app/plugins/${pluginSlug}`} />;
}
