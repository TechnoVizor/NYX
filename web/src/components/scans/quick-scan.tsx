"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api/client";
import { useMe, useProfiles } from "@/lib/api/hooks";
import type { ScopeInput, Target } from "@/lib/types";

/** What the user typed, as a scan target. The API normalizes and validates it. */
export function guessTarget(raw: string): Target {
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) return { type: "url", value };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value) || /^[0-9a-f]*:[0-9a-f:]*$/i.test(value)) return { type: "ip", value };
  return { type: "domain", value };
}

/** The scope entry that would cover the target: its host, or the address itself. */
export function scopeFor(t: Target): Pick<ScopeInput, "kind" | "value"> {
  if (t.type === "ip") return { kind: "cidr", value: t.value };
  return { kind: "domain", value: t.type === "url" ? new URL(t.value).hostname : t.value };
}

export function QuickScan() {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: profiles } = useProfiles();
  const balanced = profiles?.find((p) => p.builtin && p.name === "Balanced" && p.available);
  const [value, setValue] = useState("");
  const [outside, setOutside] = useState<Pick<ScopeInput, "kind" | "value"> | null>(null);
  const [authorization, setAuthorization] = useState("");
  const [active, setActive] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (me?.role !== "admin" && me?.role !== "analyst") return null;

  const scan = async (target: Target) => {
    const s = await api.startScan({ target, profile_id: balanced?.id });
    router.push(`/app/scans/${s.id}`);
  };
  const run = async (step: () => Promise<void>) => {
    setErr("");
    setBusy(true);
    try {
      await step();
    } catch (x) {
      if (x instanceof ApiError && x.status === 403 && !outside) {
        setOutside(scopeFor(guessTarget(value)));
      } else {
        setErr(x instanceof ApiError ? x.message : "Something went wrong. Try again.");
      }
      setBusy(false);
    }
  };
  const start = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => scan(guessTarget(value)));
  };
  const addAndStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!outside) return;
    run(async () => {
      // 409: added on an earlier try whose scan start failed.
      await api.addScope({ ...outside, authorization: authorization.trim(), active_allowed: active }).catch((x) => {
        if (!(x instanceof ApiError && x.status === 409)) throw x;
      });
      await scan(guessTarget(value));
    });
  };

  return (
    <section id="quick-scan" data-tour="quick-scan" className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold">Quick scan</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Give me a domain, IP or URL you are allowed to test. I run the {balanced ? "Balanced profile" : "plugins that can run"} on it.
      </p>
      <form onSubmit={start} className="mt-3 flex flex-wrap gap-2">
        <Input
          value={value}
          onChange={(e) => { setValue(e.target.value); setOutside(null); setErr(""); }}
          placeholder="example.com"
          aria-label="Target"
          id="quick-scan-target"
          className="max-w-sm"
        />
        <Button type="submit" data-tour="quick-scan-start" disabled={busy || !value.trim() || !!outside}>{busy && !outside ? "Starting…" : "Start scan"}</Button>
      </form>
      {outside && me.role === "admin" && (
        <form onSubmit={addAndStart} className="mt-4 flex max-w-xl flex-col gap-2 border-t border-border pt-4">
          <p className="text-sm"><span className="font-mono">{outside.value}</span> is not in scope yet. Tell me who allowed it, and I add it and start the scan.</p>
          <Input
            value={authorization}
            onChange={(e) => setAuthorization(e.target.value)}
            placeholder="Who allowed this, and on what basis (e.g. 'My own domain')"
            aria-label="Authorization"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Allow active scanning (plugins that send traffic to the target)
          </label>
          {!active && <p className="text-xs text-subtle">Without it I only run passive plugins, so the scan ends partial.</p>}
          <div><Button type="submit" disabled={busy || !authorization.trim()}>{busy ? "Starting…" : "Add to scope and scan"}</Button></div>
        </form>
      )}
      {outside && me.role !== "admin" && (
        <p className="mt-3 text-sm">
          <span className="font-mono">{outside.value}</span> is not in scope. An admin adds targets under{" "}
          <Link href="/app/targets" className="underline">Targets</Link>.
        </p>
      )}
      {err && <p role="alert" className="mt-3 text-sm text-sev-critical">{err}</p>}
    </section>
  );
}
