import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Evidence" };

export default async function Page(props: PageProps<"/app/evidence/[evidenceId]">) {
  const { evidenceId } = await props.params;
  return <PlaceholderPage phase="Arrives in Phase 5 — needs hash-addressed evidence in MinIO. Until then, a finding's raw event is on its page." title={`Evidence ${evidenceId}`} route={`/app/evidence/${evidenceId}`} />;
}
