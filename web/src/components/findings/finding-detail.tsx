"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FindingStatusText, statusLabel } from "@/components/findings/finding-status";
import { selectClass, when } from "@/components/findings/findings-table";
import { SeverityBadge } from "@/components/findings/severity-badge";
import { api, ApiError } from "@/lib/api/client";
import { useFinding, useMe } from "@/lib/api/hooks";
import { findingStatuses, type FindingStatus } from "@/lib/types";

const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
const text = (v: unknown) => (typeof v === "string" ? v : "");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="flex flex-col gap-2"><h2 className="text-sm font-semibold">{title}</h2>{children}</section>;
}
const pre = "overflow-x-auto rounded-lg border border-border p-3 font-mono text-xs";

export function FindingDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: f, error } = useFinding(id);
  const { data: me } = useMe();
  const [status, setStatus] = useState<FindingStatus | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  if (error) return <p role="alert" className="text-sm text-sev-critical">{error.message}</p>;
  if (!f) return <p className="text-sm text-muted-foreground">Loading the finding…</p>;
  const d = f.data;
  const canReview = me?.role === "admin" || me?.role === "analyst";

  const save = async () => {
    setMsg("");
    try {
      await api.reviewFinding(id, { status: status ?? f.status, note: (note ?? f.status_note ?? "") || undefined });
      await Promise.all([qc.invalidateQueries({ queryKey: ["findings"] }), qc.invalidateQueries({ queryKey: ["dashboard"] })]);
      setMsg("Saved.");
    } catch (x) {
      setMsg(x instanceof ApiError ? x.message : "Something went wrong.");
    }
  };

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <SeverityBadge severity={f.severity} /><FindingStatusText status={f.status} />
          <span className="font-mono text-xs text-subtle">{f.plugin_id} · {f.template_id}</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{f.title}</h1>
        <p className="break-all font-mono text-xs">{f.matched_at}</p>
        <p className="text-xs text-muted-foreground">
          {f.asset && <>On <Link href={`/app/assets?q=${encodeURIComponent(f.asset.value)}`} className="underline">{f.asset.value}</Link> · </>}
          first seen {when(f.first_seen)} · last seen {when(f.last_seen)}
        </p>
      </header>
      {text(d.description) && <Section title="What it is"><p className="text-sm text-muted-foreground">{text(d.description)}</p></Section>}
      {[...list(d.cve), ...list(d.cwe)].length > 0 && <p className="font-mono text-xs">{[...list(d.cve), ...list(d.cwe)].join(" · ")}</p>}
      {list(d.references).length > 0 && (
        <Section title="References">
          <ul className="text-xs">{list(d.references).map((r) => <li key={r}><a href={r} target="_blank" rel="noreferrer noopener" className="break-all underline">{r}</a></li>)}</ul>
        </Section>
      )}
      {list(d.extracted).length > 0 && <Section title="Extracted"><pre className={pre}>{list(d.extracted).join("\n")}</pre></Section>}
      {text(d.curl) && <Section title="Reproduce"><pre className={pre}>{text(d.curl)}</pre></Section>}
      <Section title="Review">
        {f.status_at && <p className="text-xs text-subtle">Last changed {when(f.status_at)}{f.status_note ? ` — ${f.status_note}` : ""}</p>}
        {canReview ? (
          <div className="flex max-w-xl flex-col gap-2">
            <select value={status ?? f.status} onChange={(e) => setStatus(e.target.value as FindingStatus)} aria-label="Status" className={`${selectClass} max-w-xs`}>
              {findingStatuses.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
            </select>
            <Textarea value={note ?? f.status_note ?? ""} onChange={(e) => setNote(e.target.value)} placeholder="Why (optional)" maxLength={2000} aria-label="Note" />
            <div className="flex items-center gap-3"><Button onClick={save}>Save review</Button>{msg && <span role="status" className="text-xs text-muted-foreground">{msg}</span>}</div>
          </div>
        ) : <p className="text-xs text-subtle">Viewers can&apos;t change the review.</p>}
      </Section>
      <Section title={`Seen in ${f.occurrences_list.length} scan${f.occurrences_list.length === 1 ? "" : "s"}`}>
        <ul className="rounded-lg border border-border text-xs">
          {f.occurrences_list.map((o) => (
            <li key={o.scan_id} className="flex gap-3 border-b border-border px-4 py-2 last:border-0">
              <Link href={`/app/scans/${o.scan_id}`} className="underline">{o.root_target.value}</Link>
              <span className="ml-auto text-subtle">{when(o.seen_at)}</span>
            </li>
          ))}
        </ul>
      </Section>
      {f.raw && <details><summary className="cursor-pointer text-sm font-semibold">Raw event</summary><pre className={`mt-2 ${pre}`}>{JSON.stringify(f.raw, null, 2)}</pre></details>}
    </div>
  );
}
