import { ActivityRail } from "@/components/layout/activity-rail";
import { CommandPalette } from "@/components/layout/command-palette";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Topbar } from "@/components/layout/topbar";
import { Tour } from "@/components/tour/tour";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <ActivityRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 px-4 pt-8 pb-24 md:px-8 md:pb-8">{children}</main>
      </div>
      <MobileNav />
      <CommandPalette />
      <Tour />
    </div>
  );
}
