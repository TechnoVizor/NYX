"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProfileForm } from "@/components/profiles/profile-form";
import { api, ApiError } from "@/lib/api/client";
import { useMe, useProfiles } from "@/lib/api/hooks";
import type { Profile } from "@/lib/types";

type Editing = { mode: "create" | "edit" | "duplicate"; profile?: Profile } | null;

const settings = (p: Profile) =>
  Object.entries(p.plugin_config)
    .map(([id, c]) => `${id.split(".").at(-1)}: ${Object.entries(c).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join("/") : String(v)}`).join(", ")}`)
    .join(" · ");

export function ProfilesView() {
  const qc = useQueryClient();
  const { data: profiles, error } = useProfiles();
  const { data: me } = useMe();
  const [editing, setEditing] = useState<Editing>(null);
  const [err, setErr] = useState("");
  const canWrite = me?.role === "admin" || me?.role === "analyst";

  const remove = async (p: Profile) => {
    if (!window.confirm(`Delete the profile "${p.name}"? Scans that used it keep their settings.`)) return;
    setErr("");
    try {
      await api.deleteProfile(p.id);
      await qc.invalidateQueries({ queryKey: ["profiles"] });
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Something went wrong.");
    }
  };

  if (error) return <p role="alert" className="text-sm text-sev-critical">{error.message}</p>;
  return (
    <div className="flex flex-col gap-4">
      {canWrite && <div><Button onClick={() => setEditing({ mode: "create" })}>New profile</Button></div>}
      {err && <p role="alert" className="text-sm text-sev-critical">{err}</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {(profiles ?? []).map((p) => (
          <li key={p.id} className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <div className="flex items-center gap-2">
              {p.builtin && <Lock className="size-3.5 text-subtle" aria-label="Built-in, read-only" />}
              <h2 className="font-semibold">{p.name}</h2>
              <span className="ml-auto font-mono text-xs text-subtle">depth {p.max_depth}</span>
            </div>
            {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
            <p className="font-mono text-xs">{p.plugin_ids.join(", ")}</p>
            {settings(p) && <p className="text-xs text-subtle">{settings(p)}</p>}
            {!p.available && <p className="text-xs text-sev-high">Not runnable now: {p.unavailable.join(", ")} is disabled or not built.</p>}
            <div className="mt-auto flex flex-wrap gap-2">
              {p.available && <Link href={`/app/scans/new?profile=${p.id}`} className={buttonVariants({ size: "sm" })}>Scan with this profile</Link>}
              {canWrite && <Button size="sm" variant="outline" onClick={() => setEditing({ mode: "duplicate", profile: p })}>Duplicate</Button>}
              {canWrite && !p.builtin && <>
                <Button size="sm" variant="outline" onClick={() => setEditing({ mode: "edit", profile: p })}>Edit</Button>
                <Button size="sm" variant="outline" onClick={() => remove(p)}>Delete</Button>
              </>}
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{editing?.mode === "edit" ? "Edit profile" : "New profile"}</DialogTitle></DialogHeader>
          {editing && <ProfileForm initial={editing.profile} mode={editing.mode} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
