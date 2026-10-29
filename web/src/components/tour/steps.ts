import type { Facts } from "@/lib/tour/progress";
import type { TourView } from "@/lib/tour/tour";

/** What a tour card says and where it points. `target` is a data-tour id; none = a centred card without a spotlight. */
export type StepCopy = {
  name: string;
  title: string;
  body: string;
  hint?: string;
  target?: string;
  primary?: { label: string; ack?: boolean; href?: string };
};

const LAB = "No domain? If the lab runs, use nyx-lab.test.";

/** Points at the step's own element on its page, or at the menu item that leads there. */
function on(pathname: string, page: (p: string) => boolean, target: string, nav: string, open: string) {
  return page(pathname) ? { target } : { target: nav, hint: `Open ${open} first.` };
}

export function copyFor(view: NonNullable<TourView>, f: Facts, pathname: string): StepCopy {
  const home = (p: string) => p === "/app/dashboard";
  switch (`${view.step}/${view.variant}`) {
    case "welcome/default":
      return {
        name: "Hello",
        title: "Hi, I'm NYX.",
        body: "I map what your domains show to the internet. A few quick steps, on the real screens.",
        target: home(pathname) ? "home-steps" : undefined,
        primary: { label: "Show me", ack: true },
      };
    case "target/default":
      return {
        name: "Targets",
        title: "First, something you're allowed to test",
        body: `I scan only what is on this list. Add your domain. ${LAB}`,
        ...on(pathname, (p) => p === "/app/targets", "target-form", "nav-targets", "Targets"),
      };
    case "target/waiting-admin":
      return {
        name: "Targets",
        title: "Waiting for a target",
        body: "Admins add targets. I continue once there is one.",
      };
    case "scan/default":
      return {
        name: "Scan",
        title: "Now let me look",
        body: "Type your target, press Start scan.",
        ...on(pathname, home, "quick-scan", "nav-home", "Home"),
      };
    case "scan/scan-running":
      return {
        name: "Scan",
        title: "Scanning",
        body: "A few minutes. Go anywhere; I pick up when it is done.",
        primary: { label: "Watch the scan", href: `/app/scans/${f.scans[0]?.id}` },
      };
    case "scan/scan-failed":
      return {
        name: "Scan",
        title: "That scan didn't finish",
        body: `${f.scans[0]?.error ?? "It stopped before any plugin succeeded."} Check the target and run it again.`,
        ...on(pathname, home, "quick-scan", "nav-home", "Home"),
      };
    case "findings/no-findings":
      return {
        name: "Findings",
        title: "Nothing to report",
        body: "No issues. Want to see one? Scan testbed.nyx-lab.test if the lab runs.",
        primary: { label: "Finish", ack: true },
      };
    case "findings/default":
      return {
        name: "Findings",
        title: "What I found",
        body: "One row per issue, across all scans. Open one for its evidence.",
        primary: { label: "Got it", ack: true },
        ...on(pathname, (p) => p === "/app/findings", "finding-row", "nav-findings", "Findings"),
      };
    default:
      return {
        name: "Review",
        title: "Your call",
        body: "Confirmed, false positive, accepted risk or fixed: your call, kept across rescans.",
        ...(pathname.startsWith("/app/findings/")
          ? { target: "review" }
          : pathname === "/app/findings"
            ? { target: "finding-row", hint: "Open one of them." }
            : { target: "nav-findings", hint: "Open Findings first." }),
      };
  }
}
