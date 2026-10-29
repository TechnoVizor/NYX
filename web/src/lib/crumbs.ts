// Breadcrumbs from the URL: section › record › tab. Record ids show their name when a query already knows it.

import { navGroups, scanTabs, settingsNav, settingsTabs } from "./nav.ts";

export type Crumb = { label: string; href?: string; mono?: boolean };

const sections = [...navGroups.flatMap((g) => g.items), settingsNav];
const words: Record<string, string> = { new: "New scan", ...Object.fromEntries(scanTabs.filter((t) => t.path).map((t) => [t.path.slice(1), t.label])) };

export function crumbs(pathname: string, names: Record<string, string>): Crumb[] {
  const [, , first, ...rest] = pathname.split("/").filter((_, i, a) => i === 0 || a[i] !== "");
  if (!first) return [];
  const section = sections.find((s) => s.href.split("/")[2] === first);
  const out: Crumb[] = [{ label: section?.label ?? first, href: section?.href ?? `/app/${first}` }];
  let href = `/app/${first}`;
  for (const seg of rest) {
    href += `/${seg}`;
    const tab = first === "settings" ? settingsTabs.find((t) => t.href === href)?.label : words[seg];
    out.push(tab ? { label: tab, href } : { label: names[seg] ?? seg.slice(0, 8), href, mono: true });
  }
  delete out[out.length - 1].href;
  return out;
}
