"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { getItems } from "@/lib/data";
import { db } from "@/lib/db";
import { MARKET_VIEWS } from "@/lib/markets";

export type AlertFormState = { error?: string; ok?: boolean };

const KINDS = new Set(["spike_risk", "price_above", "price_below"]);
const MAX_RULES = 20;

/** Add a price alert for the signed-in owner. */
export async function createRule(_prev: AlertFormState, form: FormData): Promise<AlertFormState> {
  const user = await requireUser();
  const kind = String(form.get("kind") ?? "");
  if (!KINDS.has(kind)) return { error: "Pick what to watch for." };

  const rawItem = String(form.get("item") ?? "");
  const items = await getItems();
  const item = rawItem === "_basket" ? null : items.find((i) => i.key === rawItem)?.key;
  if (item === undefined) return { error: "Pick an item." };
  if (item === null && kind !== "spike_risk") return { error: "Price limits need one item, not the whole basket." };

  const [market, type] = String(form.get("view") ?? "").split(":");
  const view = MARKET_VIEWS.find((v) => v.market === market && v.type === type);
  if (!view) return { error: "Pick a market." };

  const value = Number(form.get("threshold"));
  let threshold: number;
  if (kind === "spike_risk") {
    if (!Number.isFinite(value) || value < 5 || value > 95) return { error: "Spike chance must be between 5% and 95%." };
    threshold = value / 100;
  } else {
    if (!Number.isFinite(value) || value <= 0 || value > 100000) return { error: "Enter a price in rupees." };
    threshold = value;
  }

  const count = Number((await db()`select count(*)::int as n from alert_rules where user_id = ${user.id} and active`)[0].n);
  if (count >= MAX_RULES) return { error: `You can keep up to ${MAX_RULES} alerts. Delete one first.` };

  await db()`
    insert into alert_rules (user_id, item_key, market, price_type, kind, threshold)
    values (${user.id}, ${item}, ${view.market}, ${view.type}, ${kind}, ${threshold})`;
  revalidatePath("/app/alerts");
  return { ok: true };
}

export async function deleteRule(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  await db()`delete from alert_rules where id = ${id} and user_id = ${user.id}`;
  revalidatePath("/app/alerts");
}

export async function markAllRead(): Promise<void> {
  const user = await requireUser();
  await db()`
    update alert_events e set read_at = now()
    from alert_rules r
    where r.id = e.rule_id and r.user_id = ${user.id} and e.read_at is null`;
  revalidatePath("/app/alerts");
}
