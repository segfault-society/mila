"use client";

import { useActionState } from "react";
import { createKitchen, type KitchenFormState } from "./actions";
import type { Item } from "@/lib/types";
import type { MarketView } from "@/lib/markets";

// a typical 150-packet rice-and-curry kitchen, per day (kg, or nuts for coconut)
const DEFAULTS: Record<string, number> = {
  samba: 12, beans: 2, carrot: 2, cabbage: 2, pumpkin: 2, brinjal: 1.5, tomato: 1, green_chilli: 0.5,
  big_onion_imp: 2, red_onion_local: 1, potato_local: 2, red_dhal: 2, coconut: 15, dried_chilli_imp: 0.3, lime: 0.2,
};

export function KitchenForm({ items, views }: { items: Item[]; views: MarketView[] }) {
  const [state, action, pending] = useActionState<KitchenFormState, FormData>(createKitchen, {});
  return (
    <form action={action} className="space-y-6">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Eatery name</span>
        <input name="name" required maxLength={80} placeholder="e.g. Kamal's Hotel, Maharagama"
          className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Where you usually buy</span>
        <select name="view" defaultValue="pettah:wholesale" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
          {views.filter((v) => v.market !== "marandagahamula").map((v) => (
            <option key={`${v.market}:${v.type}`} value={`${v.market}:${v.type}`}>{v.label}</option>
          ))}
        </select>
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">How much you use per day</legend>
        <p className="text-xs text-muted-foreground">Leave 0 for items you don&apos;t buy. You can change this later.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <label key={item.key} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <span className="text-sm">{item.name}</span>
              <span className="flex items-center gap-1.5">
                <input name={`qty:${item.key}`} type="number" min={0} max={1000} step="0.1"
                  defaultValue={DEFAULTS[item.key] ?? 0} inputMode="decimal"
                  className="h-8 w-20 rounded border bg-background px-2 text-right text-sm tabular-nums" />
                <span className="w-8 text-xs text-muted-foreground">{item.unit === "nut" ? "nuts" : item.unit}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {state.error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
      <button type="submit" disabled={pending}
        className="inline-flex h-10 items-center rounded-lg bg-brand px-5 text-sm font-medium text-background disabled:opacity-60">
        {pending ? "Saving…" : "Create my kitchen"}
      </button>
    </form>
  );
}
