"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, Crosshair, Zap } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api/client";
import { useMe, useProfiles } from "@/lib/api/hooks";
import type { ScopeInput, Target } from "@/lib/types";
import { profileFor } from "@/lib/home";
import { cn } from "@/lib/utils";

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
  const usable = profiles?.filter((p) => p.available) ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const profileId = profileFor(usable, picked);
  const [value, setValue] = useState("");
  const [outside, setOutside] = useState<Pick<ScopeInput, "kind" | "value"> | null>(null);
  const [authorization, setAuthorization] = useState("");
  const [active, setActive] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (me?.role !== "admin" && me?.role !== "analyst") return null;

  const scan = async (target: Target) => {
    const s = await api.startScan({ target, profile_id: profileId });
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
    <section id="quick-scan" data-tour="quick-scan">
      {/* The command bar: one wide field, the profile as chips, a white Start. */}
      <form
        onSubmit={start}
        className="flex min-h-13 flex-wrap items-center gap-2 rounded-lg border border-input bg-surface-3 py-1.5 pr-1.5 pl-4 transition-colors focus-within:border-brand"
      >
        <Crosshair className="size-4 shrink-0 text-brand" aria-hidden />
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value); setOutside(null); setErr(""); }}
          placeholder="Domain, IP or URL"
          aria-label="Target"
          id="quick-scan-target"
          autoComplete="off"
          className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
        {usable.length > 1 && (
          <div role="radiogroup" aria-label="Scan profile" className="flex flex-wrap gap-1.5 max-md:order-last max-md:w-full max-md:pb-1">
            {usable.map((p) => {
              const on = p.id === profileId;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPicked(p.id)}
                  title={`${p.plugin_ids.length} tools`}
                  className={cn(
                    "h-7 rounded border px-2.5 text-xs transition-colors",
                    on ? "border-brand bg-brand-soft text-foreground" : "border-border-strong text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
        <Button type="submit" data-tour="quick-scan-start" className="h-10 px-4" disabled={busy || !value.trim() || !!outside}>
          {busy && !outside ? "Starting…" : "Start scan"}
          <ArrowRight />
        </Button>
      </form>
      {outside && me.role === "admin" && (
        <form onSubmit={addAndStart} className="mt-3 flex max-w-xl flex-col gap-2 rounded-lg border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-sm"><Crosshair className="size-4 shrink-0 text-brand" aria-hidden /><span className="min-w-0 font-mono break-all">{outside.value}</span> is not a target yet.</p>
          <label className="flex flex-col gap-1.5 text-sm">
            Who allowed it
            <Input value={authorization} onChange={(e) => setAuthorization(e.target.value)} placeholder="e.g. My own domain" />
          </label>
          <label className="flex items-center gap-2 text-sm" title="Lets plugins send traffic to the target, not only read public sources">
            <Checkbox checked={active} onCheckedChange={(checked) => setActive(checked)} />
            <Zap className="size-4 text-sev-medium" aria-hidden /> Active scanning
            <span className="text-muted-foreground">· sends traffic</span>
          </label>
          {!active && <p className="text-xs text-muted-foreground">Passive only: the scan ends partial.</p>}
          <div><Button type="submit" disabled={busy || !authorization.trim()}>{busy ? "Starting…" : "Add and scan"}</Button></div>
        </form>
      )}
      {outside && me.role !== "admin" && (
        <p className="mt-3 text-sm">
          <span className="font-mono break-all">{outside.value}</span> is not a target. Admins add them in{" "}
          <Link href="/app/targets" className="underline">Targets</Link>.
        </p>
      )}
      {err && <p role="alert" className="mt-3 text-sm text-sev-critical">{err}</p>}
    </section>
  );
}
