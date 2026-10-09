import { redirect } from "next/navigation";

// No separate live view until events stream over SSE: the overview polls while the scan runs.
export default async function Page(props: PageProps<"/app/scans/[scanId]/live">) {
  const { scanId } = await props.params;
  redirect(`/app/scans/${scanId}`);
}
