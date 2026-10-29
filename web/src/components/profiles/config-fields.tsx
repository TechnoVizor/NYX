"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePlugin } from "@/lib/api/hooks";
import type { JsonSchema } from "@/lib/types";

type Value = Record<string, unknown>;

const kind = (s: JsonSchema) =>
  s.type === "array" && s.items?.enum ? "choices" : s.type === "array" && s.items?.type === "string" ? "strings" : "json";

/** One plugin's settings, generated from its manifest's config_schema. */
export function ConfigFields({ pluginId, value, onChange }: { pluginId: string; value: Value; onChange: (v: Value) => void }) {
  const { data: plugin } = usePlugin(pluginId);
  const props = plugin?.manifest.config_schema?.properties ?? {};
  const names = Object.keys(props);
  if (!plugin || !names.length) return null;
  const set = (name: string, v: unknown) => {
    const next = { ...value, [name]: v };
    if (v === undefined) delete next[name];
    onChange(next);
  };
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-semibold">{plugin.name} settings</legend>
      {names.some((n) => kind(props[n]) === "json")
        ? <JsonField value={value} onChange={onChange} />
        : names.map((n) => <Field key={n} name={n} schema={props[n]} value={value[n]} onChange={(v) => set(n, v)} />)}
    </fieldset>
  );
}

function Field({ name, schema, value, onChange }: { name: string; schema: JsonSchema; value: unknown; onChange: (v: unknown) => void }) {
  const current = (Array.isArray(value) ? value : Array.isArray(schema.default) ? schema.default : []).map(String);
  if (kind(schema) === "choices") {
    const options = (schema.items?.enum ?? []).map(String);
    const toggle = (o: string) => {
      const on = current.includes(o) ? current.filter((x) => x !== o) : [...current, o];
      onChange(options.filter((x) => on.includes(x)));
    };
    return (
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="text-xs text-muted-foreground">{name}</span>
        <div className="flex flex-wrap gap-3">
          {options.map((o) => <label key={o} className="flex items-center gap-1.5"><input type="checkbox" checked={current.includes(o)} onChange={() => toggle(o)} />{o}</label>)}
        </div>
      </div>
    );
  }
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs text-muted-foreground">{name} (comma-separated)</span>
      <Input defaultValue={current.join(", ")} onChange={(e) => {
        const items = e.target.value.split(",").map((x) => x.trim()).filter(Boolean);
        onChange(items.length ? items : undefined);
      }} />
    </label>
  );
}

function JsonField({ value, onChange }: { value: Value; onChange: (v: Value) => void }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [bad, setBad] = useState(false);
  return (
    <Textarea value={text} aria-invalid={bad} aria-label="Settings as JSON" className="font-mono text-xs" onChange={(e) => {
      setText(e.target.value);
      try { onChange(JSON.parse(e.target.value || "{}")); setBad(false); } catch { setBad(true); }
    }} />
  );
}
