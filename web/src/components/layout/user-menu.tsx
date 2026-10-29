"use client";

import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import { LogOut, Palette } from "lucide-react";
import { useSignOut } from "@/components/layout/topbar";
import { useMe } from "@/lib/api/hooks";

const item = "flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-[13px] outline-none data-highlighted:bg-accent";

/** Avatar with the account: who is signed in, appearance, sign out. */
export function UserMenu() {
  const { data: me } = useMe();
  const { signOut, error } = useSignOut();
  if (!me) return null;
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Account: ${me.email}`}
        className="flex size-8 items-center justify-center rounded-full bg-brand font-medium text-sidebar-primary-foreground transition-transform active:scale-[0.97]"
      >
        {me.email[0]?.toUpperCase()}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
          <Menu.Popup className="min-w-56 origin-(--transform-origin) rounded-lg bg-popover p-1 text-popover-foreground ring-1 ring-border-strong transition-[opacity,transform] duration-150 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <div className="px-2 py-1.5">
              <p className="truncate text-[13px] font-medium">{me.email}</p>
              <span className="mt-1 inline-block rounded bg-brand-soft px-1.5 text-xs capitalize text-brand">{me.role}</span>
            </div>
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Item className={item} render={<Link href="/app/settings/appearance" />}>
              <Palette className="size-4 text-muted-foreground" /> Appearance
            </Menu.Item>
            <Menu.Item className={item} onClick={signOut}>
              <LogOut className="size-4 text-muted-foreground" /> Sign out
            </Menu.Item>
            {error && <p role="alert" className="px-2 pb-1 text-xs text-sev-critical">{error}</p>}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
