import { SubNav } from "@/components/shared/sub-nav";
import { scanTabs } from "@/lib/nav";

export default async function ScanLayout({ children, params }: LayoutProps<"/app/scans/[scanId]">) {
  const { scanId } = await params;
  const items = scanTabs.map((t) => ({ label: t.label, href: `/app/scans/${scanId}${t.path}` }));
  return (
    <>
      <div className="mb-5">
        <p className="font-mono text-xs text-subtle">Scan</p>
        <h1 className="text-xl font-semibold tracking-tight">{scanId}</h1>
      </div>
      <SubNav label="Scan sections" items={items} />
      {children}
    </>
  );
}
