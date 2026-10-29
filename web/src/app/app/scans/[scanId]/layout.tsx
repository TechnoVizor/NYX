import { ScanHeader } from "@/components/scans/scan-header";
import { SubNav } from "@/components/shared/sub-nav";
import { scanTabs } from "@/lib/nav";

export default async function ScanLayout({ children, params }: LayoutProps<"/app/scans/[scanId]">) {
  const { scanId } = await params;
  const items = scanTabs.map((t) => ({ label: t.label, href: `/app/scans/${scanId}${t.path}` }));
  return (
    <>
      <ScanHeader id={scanId} />
      <SubNav label="Scan sections" items={items} />
      {children}
    </>
  );
}
