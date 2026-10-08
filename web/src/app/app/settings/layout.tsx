import { PageHeader } from "@/components/shared/page-header";
import { SubNav } from "@/components/shared/sub-nav";
import { settingsTabs } from "@/lib/nav";

export default function SettingsLayout({ children }: LayoutProps<"/app/settings">) {
  return (
    <>
      <PageHeader title="Settings" />
      <SubNav label="Settings sections" items={settingsTabs} />
      {children}
    </>
  );
}
