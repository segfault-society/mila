"use client";

import { useActionState } from "react";
import { createKitchen, type KitchenFormState } from "./actions";
import type { Item } from "@/lib/types";
import type { MarketView } from "@/lib/markets";

import { DEFAULT_BASKET as DEFAULTS } from "@/lib/basket";

export function KitchenForm({ items, views }: { items: Item[]; views: MarketView[] }) {
  const [state, action, pending] = useActionState<KitchenFormState, FormData>(createKitchen, {});
  return (
    <form action={action} className="space-y-6">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Eatery name</span>
        <input name="name" required maxLength={80} placeholder="e.g. Kamal's Hotel, Maharagama"
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Where you usually buy</span>
        <select name="view" defaultValue="pettah:wholesale" className="h-10 w-full rounded-lg border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30">
          {views.filter((v) => v.market !== "marandagahamula").map((v) => (
            <option key={`${v.market}:${v.type}`} value={`${v.market}:${v.type}`}>{v.label}</option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">
          Rice packets you sell a day <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <input name="packets" type="number" min={1} max={5000} step={1} inputMode="numeric" placeholder="e.g. 150"
          className="h-10 w-40 rounded-lg border bg-background px-3 text-sm tabular-nums shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
        <span className="block text-xs text-muted-foreground">Mila uses this to show what your basket costs per packet.</span>
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">How much you use per day</legend>
        <p className="text-xs text-muted-foreground">Filled in for a typical 150-packet kitchen. Set 0 for items you don&apos;t buy.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <label key={item.key} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
              <span className="text-sm">{item.name}</span>
              <span className="flex items-center gap-1.5">
                <input name={`qty:${item.key}`} type="number" min={0} max={1000} step="0.1"
                  defaultValue={DEFAULTS[item.key] ?? 0} inputMode="decimal"
                  className="h-8 w-20 rounded-md border bg-background px-2 text-right text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
                <span className="w-8 text-xs text-muted-foreground">{item.unit === "nut" ? "nuts" : item.unit}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {state.error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
      <button type="submit" disabled={pending}
        className="inline-flex h-10 items-center rounded-lg bg-foreground px-5 text-sm font-medium text-background shadow-sm transition hover:bg-foreground/85 disabled:opacity-60">
        {pending ? "Saving…" : "Create my kitchen"}
      </button>
    </form>
  );
}
