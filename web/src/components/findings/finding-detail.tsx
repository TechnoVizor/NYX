"use client";

import { CopyButton } from "@/components/shared/copy-button";
import { ChevronRight, ExternalLink } from "lucide-react";
import { Time } from "@/components/shared/time";
import { Choice } from "@/components/shared/choice";
import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FindingStatusText, statusLabel } from "@/components/findings/finding-status";
import { SeverityBadge } from "@/components/findings/severity-badge";
import { api, ApiError } from "@/lib/api/client";
import { PluginTile } from "@/components/shared/plugin-tile";
import { useFinding, useMe } from "@/lib/api/hooks";
import { findingStatuses, type FindingStatus } from "@/lib/types";

const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
const text = (v: unknown) => (typeof v === "string" ? v : "");

function Section({ title, children, tour }: { title: string; children: React.ReactNode; tour?: string }) {
  return <section data-tour={tour} className="flex flex-col gap-2"><h2 className="text-sm font-semibold">{title}</h2>{children}</section>;
}
const pre = "overflow-x-auto rounded-lg border border-border p-3 font-mono text-xs";

export function FindingDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: f, error } = useFinding(id);
  const { data: me } = useMe();
  const [status, setStatus] = useState<FindingStatus | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const [revealed, setRevealed] = useState<string[] | null>(null);
  const [revealErr, setRevealErr] = useState("");
  if (error) return <p role="alert" className="text-sm text-sev-critical">{error.message}</p>;
  if (!f) return <p className="text-sm text-muted-foreground">Loading the finding…</p>;
  const d = f.data;
  const canReview = me?.role === "admin" || me?.role === "analyst";

  const reveal = async () => {
    setRevealErr("");
    try {
      setRevealed((await api.revealFinding(id)).extracted ?? []);
    } catch (x) {
      setRevealErr(x instanceof ApiError ? x.message : "Something went wrong. Try again.");
    }
  };

  const save = async () => {
    setMsg("");
    setBusy(true);
    try {
      await api.reviewFinding(id, { status: status ?? f.status, note: (note ?? f.status_note ?? "") || undefined });
      await Promise.all([qc.invalidateQueries({ queryKey: ["findings"] }), qc.invalidateQueries({ queryKey: ["dashboard"] })]);
      setMsg("Saved.");
    } catch (x) {
      setMsg(x instanceof ApiError ? x.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <SeverityBadge severity={f.severity} /><FindingStatusText status={f.status} />
          <PluginTile id={f.plugin_id} withName />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{f.title}</h1>
        <p className="break-all font-mono text-xs">{f.matched_at}</p>
        <p className="text-xs text-muted-foreground">
          {f.asset && <>On <Link href={`/app/assets?q=${encodeURIComponent(f.asset.value)}`} className="underline">{f.asset.value}</Link> · </>}
          first seen <Time iso={f.first_seen} /> · last seen <Time iso={f.last_seen} />
        </p>
      </header>
      {text(d.description) && <Section title="What it is"><p className="text-sm text-muted-foreground">{text(d.description)}</p></Section>}
      {[...list(d.cve), ...list(d.cwe)].length > 0 && (
        <p className="flex flex-wrap gap-2">
          {[...list(d.cve), ...list(d.cwe)].map((id) => {
            const up = id.toUpperCase();
            const href = up.startsWith("CWE-") ? `https://cwe.mitre.org/data/definitions/${up.slice(4)}.html` : `https://nvd.nist.gov/vuln/detail/${up}`;
            return <a key={id} href={href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 rounded border border-border-strong px-1.5 font-mono text-xs hover:border-brand">{up}<ExternalLink className="size-3" aria-hidden /></a>;
          })}
        </p>
      )}
      {list(d.references).length > 0 && (
        <Section title="References">
          <ul className="text-xs">{list(d.references).map((r) => <li key={r}><a href={r} target="_blank" rel="noreferrer noopener" className="break-all underline">{r}</a></li>)}</ul>
        </Section>
      )}
      {list(d.extracted).length > 0 && (
        <Section title="Extracted">
          <pre className={pre}>{(revealed ?? list(d.extracted)).join("\n")}</pre>
          {canReview ? (
            <div className="flex items-center gap-3 text-xs">
              <Button variant="outline" size="sm" onClick={revealed ? () => setRevealed(null) : reveal}>{revealed ? "Mask values" : "Show values"}</Button>
              <span className="text-subtle">{revealed ? "Raw values. They can be live secrets." : "Masked: these can be live secrets."}</span>
              {revealErr && <span role="alert" className="text-sev-critical">{revealErr}</span>}
            </div>
          ) : <p className="text-xs text-subtle">Masked: these can be live secrets. Analysts and admins can show them.</p>}
        </Section>
      )}
      {text(d.curl) && (
        <Section title="Reproduce">
          <div className="flex items-start gap-2"><pre className={`${pre} min-w-0 flex-1`}>{text(d.curl)}</pre><CopyButton text={text(d.curl)} label="Copy the command" /></div>
        </Section>
      )}
      <Section title="Review" tour="review">
        {f.status_at && <p className="text-xs text-subtle">Last changed <Time iso={f.status_at} />{f.status_note ? ` — ${f.status_note}` : ""}</p>}
        {canReview ? (
          <div className="flex max-w-xl flex-col gap-2">
            <Choice value={status ?? f.status} onChange={(v) => setStatus(v as FindingStatus)} label="Status" className="max-w-xs" options={findingStatuses.map((s) => ({ value: s, label: statusLabel[s] }))} />
            <Textarea value={note ?? f.status_note ?? ""} onChange={(e) => setNote(e.target.value)} placeholder="Why (optional)" maxLength={2000} aria-label="Note" className="resize-none" />
            <div className="flex items-center gap-3"><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save review"}</Button>{msg && <span role="status" className="text-xs text-muted-foreground">{msg}</span>}</div>
          </div>
        ) : <p className="text-xs text-subtle">Viewers can&apos;t change the review.</p>}
      </Section>
      <Section title={`Seen in ${f.occurrences_list.length} scan${f.occurrences_list.length === 1 ? "" : "s"}`}>
        <ul className="rounded-lg border border-border text-xs">
          {f.occurrences_list.map((o) => (
            <li key={o.scan_id} className="flex gap-3 border-b border-border px-4 py-2 last:border-0">
              <Link href={`/app/scans/${o.scan_id}`} className="underline">Scan, <Time iso={o.seen_at} /></Link>
              <span className="ml-auto text-muted-foreground">{o.root_target.value}</span>
            </li>
          ))}
        </ul>
      </Section>
      {f.raw && (
        <section>
          <button type="button" onClick={() => setRawOpen(!rawOpen)} aria-expanded={rawOpen} className="flex items-center gap-1.5 text-sm font-semibold">
            <ChevronRight className={`size-4 transition-transform ${rawOpen ? "rotate-90" : ""}`} aria-hidden /> Raw event
          </button>
          {rawOpen && <pre className={`mt-2 ${pre}`}>{JSON.stringify(f.raw, null, 2)}</pre>}
        </section>
      )}
    </div>
  );
}
