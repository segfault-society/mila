"use client";

import { useActionState, useState } from "react";
import type { MarketView } from "@/lib/markets";
import { createRule, type AlertFormState } from "./actions";

type Option = { key: string; name: string };

const field = "h-10 w-full rounded-md border bg-background px-3 text-sm";

export function AlertForm({
  items,
  views,
  defaultView,
  hasKitchen,
}: {
  items: Option[];
  views: MarketView[];
  defaultView: string;
  hasKitchen: boolean;
}) {
  const [state, action, pending] = useActionState<AlertFormState, FormData>(createRule, {});
  const [kind, setKind] = useState("spike_risk");
  const [item, setItem] = useState(hasKitchen ? "_basket" : (items[0]?.key ?? ""));

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1.5">
        <span className="text-sm font-medium">Tell me when</span>
        <select
          name="kind"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            if (e.target.value !== "spike_risk" && item === "_basket") setItem(items[0]?.key ?? "");
          }}
          className={field}
        >
          <option value="spike_risk">the spike risk reaches</option>
          <option value="price_above">next week&apos;s price goes above</option>
          <option value="price_below">next week&apos;s price drops below</option>
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="text-sm font-medium">{kind === "spike_risk" ? "Spike chance (%)" : "Price (Rs per unit)"}</span>
        <input
          key={kind}
          name="threshold"
          type="number"
          inputMode="decimal"
          required
          min={kind === "spike_risk" ? 5 : 1}
          max={kind === "spike_risk" ? 95 : 100000}
          step={kind === "spike_risk" ? 5 : 1}
          defaultValue={kind === "spike_risk" ? 20 : ""}
          placeholder={kind === "spike_risk" ? "20" : "e.g. 600"}
          className={field}
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-sm font-medium">For</span>
        <select name="item" value={item} onChange={(e) => setItem(e.target.value)} className={field}>
          {hasKitchen && kind === "spike_risk" ? <option value="_basket">Any item in my kitchen</option> : null}
          {items.map((i) => (
            <option key={i.key} value={i.key}>
              {i.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="text-sm font-medium">At</span>
        <select name="view" defaultValue={defaultView} className={field}>
          {views.map((v) => (
            <option key={`${v.market}:${v.type}`} value={`${v.market}:${v.type}`}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-lg bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add alert"}
        </button>
        {state.error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        ) : state.ok ? (
          <p className="text-sm text-muted-foreground">Alert added. Mila checks it after every new forecast.</p>
        ) : null}
      </div>
    </form>
  );
}
