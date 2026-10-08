import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Evidence" };

export default async function Page(props: PageProps<"/app/evidence/[evidenceId]">) {
  const { evidenceId } = await props.params;
  return <PlaceholderPage title={`Evidence ${evidenceId}`} route={`/app/evidence/${evidenceId}`} />;
}
