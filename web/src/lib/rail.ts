// Whether the sidebar is expanded, per browser. Open unless the user closed it.

const KEY = "nyx-rail";

export function loadRailOpen(): boolean {
  try {
    return localStorage.getItem(KEY) !== "closed";
  } catch {
    return true;
  }
}

export function saveRailOpen(open: boolean): void {
  try {
    localStorage.setItem(KEY, open ? "open" : "closed");
  } catch {
    // the choice then lasts for this page only
  }
}
