export { cn } from "cn"

export type SearchParams = Record<string, string | string[] | undefined>

export const param = (sp: SearchParams | undefined, key: string) => {
  const v = sp?.[key]
  return typeof v === "string" ? v : ""
}

/** Mirrors list filters into the address bar, so a filtered view can be shared and comes back on Back. */
export function syncQuery(params: Record<string, string>) {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v))
  window.history.replaceState(null, "", s.size ? `?${s}` : window.location.pathname)
}
