import "server-only";
import { priceBasket, type PricedBasket } from "@/lib/basket";
import { db } from "@/lib/db";
import type { Signal } from "@/lib/signals";
import type { BoardRow, Run } from "@/lib/types";

/** Items that can stand in for each other in a rice-and-curry kitchen, by the role they play on the plate. */
export const SUBSTITUTE_GROUPS: { role: string; keys: string[] }[] = [
  { role: "curry vegetable", keys: ["beans", "carrot", "cabbage", "brinjal", "pumpkin", "snake_gourd"] },
  { role: "onion", keys: ["red_onion_local", "red_onion_imp", "big_onion_local", "big_onion_imp"] },
  { role: "potato", keys: ["potato_local", "potato_imp"] },
  { role: "rice", keys: ["samba", "nadu", "kekulu_white", "kekulu_red"] },
];

/** Items that keep for a week or more, so buying a week's stock early is practical. */
export const STORABLES = new Set([
  "red_onion_local",
  "red_onion_imp",
  "big_onion_local",
  "big_onion_imp",
  "potato_local",
  "potato_imp",
  "dried_chilli_imp",
  "red_dhal",
  "sugar_white",
  "coconut_oil",
  "samba",
  "nadu",
  "kekulu_white",
  "kekulu_red",
]);

/** A swap is suggested for an item flagged spike or rise, or whose middle estimate is this much above today. */
const RISE_TRIGGER = 0.05;
const MAX_OPTIONS = 2;

export const PACKETS_MIN = 1;
export const PACKETS_MAX = 5000;

/** One item's price today and its forecast middle estimate for next week. Only items with a real forecast. */
export type Outlook = {
  row: BoardRow;
  today: number;
  mid: number;
  /** expected change, next week's middle estimate vs today */
  change: number;
  signal: Signal;
  spikeProb: number | null;
};

export type SwapOption = {
  sub: Outlook;
  /** owner's daily quantity of the original item, priced at each item's middle estimate */
  fromCost: number;
  subCost: number;
  /** fromCost − subCost: positive means the substitute costs less a day */
  saving: number;
  inBasket: boolean;
};

export type Swap = { from: Outlook; qty: number; role: string; options: SwapOption[] };

export type BuyAhead =
  | { kind: "buy_now"; o: Outlook; qty: number; saving: number }
  | { kind: "no_saving"; o: Outlook; qty: number }
  | { kind: "ease"; o: Outlook; qty: number };

export type Plan = {
  priced: PricedBasket;
  swaps: Swap[];
  buyAhead: BuyAhead[];
  /** storables in the basket that were checked (have a forecast) */
  storablesChecked: BoardRow[];
  /** storables in the basket without a forecast this week */
  storablesNoForecast: BoardRow[];
  saving: { swapsPerDay: number; buyAheadWeek: number; perDay: number };
  targetDate: string | null;
  dataDate: string | null;
};

export function outlook(row: BoardRow | undefined): Outlook | null {
  const f = row?.forecast;
  if (!row || !f || f.signal === "no_forecast" || f.q50 == null) return null;
  if (row.latestPrice == null || row.latestPrice <= 0) return null;
  return {
    row,
    today: row.latestPrice,
    mid: f.q50,
    change: f.q50 / row.latestPrice - 1,
    signal: f.signal,
    spikeProb: f.spikeProb,
  };
}

function groupOf(key: string) {
  return SUBSTITUTE_GROUPS.find((g) => g.keys.includes(key)) ?? null;
}

/** Swaps, buy-ahead advice and the possible saving for one day of an owner's basket. */
export function buildPlan(board: { rows: BoardRow[]; run: Run | null }, basket: Record<string, number>): Plan {
  const priced = priceBasket(board.rows, basket);
  const byKey = new Map(board.rows.map((r) => [r.key, r]));

  const swaps: Swap[] = [];
  for (const row of priced.mine) {
    const qty = basket[row.key];
    const group = groupOf(row.key);
    const from = outlook(row);
    if (!group || !from || !(qty > 0)) continue;
    const rising = from.signal === "spike" || from.signal === "rise" || from.change >= RISE_TRIGGER;
    if (!rising) continue;

    const options = group.keys
      .filter((k) => k !== row.key)
      .map((k) => outlook(byKey.get(k)))
      .filter((o): o is Outlook => o != null && (o.signal === "steady" || o.signal === "fall") && o.change < from.change)
      .map((sub) => {
        const fromCost = qty * from.mid;
        const subCost = qty * sub.mid;
        return { sub, fromCost, subCost, saving: fromCost - subCost, inBasket: sub.row.key in basket };
      })
      .sort((a, b) => b.saving - a.saving || a.sub.change - b.sub.change)
      .slice(0, MAX_OPTIONS);
    swaps.push({ from, qty, role: group.role, options });
  }
  swaps.sort((a, b) => (b.options[0]?.saving ?? -Infinity) - (a.options[0]?.saving ?? -Infinity));

  const storables = priced.mine.filter((r) => STORABLES.has(r.key) && basket[r.key] > 0);
  const storablesChecked: BoardRow[] = [];
  const storablesNoForecast: BoardRow[] = [];
  const buyAhead: BuyAhead[] = [];
  for (const row of storables) {
    const o = outlook(row);
    if (!o) {
      storablesNoForecast.push(row);
      continue;
    }
    storablesChecked.push(row);
    const qty = basket[row.key];
    if (o.signal === "spike" || o.signal === "rise") {
      const saving = qty * 7 * (o.mid - o.today);
      buyAhead.push(saving > 0 ? { kind: "buy_now", o, qty, saving } : { kind: "no_saving", o, qty });
    } else if (o.signal === "fall") {
      buyAhead.push({ kind: "ease", o, qty });
    }
  }
  const order = { buy_now: 0, no_saving: 1, ease: 2 } as const;
  buyAhead.sort(
    (a, b) =>
      order[a.kind] - order[b.kind] ||
      (b.kind === "buy_now" ? b.saving : 0) - (a.kind === "buy_now" ? a.saving : 0),
  );

  const swapsPerDay = swaps.reduce((acc, s) => acc + Math.max(0, s.options[0]?.saving ?? 0), 0);
  const buyAheadWeek = buyAhead.reduce((acc, b) => acc + (b.kind === "buy_now" ? b.saving : 0), 0);

  const targetDate =
    priced.target ?? board.rows.find((r) => r.forecast && r.forecast.signal !== "no_forecast")?.forecast?.targetDate ?? null;

  return {
    priced,
    swaps,
    buyAhead,
    storablesChecked,
    storablesNoForecast,
    saving: { swapsPerDay, buyAheadWeek, perDay: swapsPerDay + buyAheadWeek / 7 },
    targetDate,
    dataDate: board.run?.dataDate ?? null,
  };
}

/** Basket cost per rice packet, today and next week (middle estimate and 80% range). */
export function perPacket(priced: PricedBasket, packets: number) {
  const { today, mid, lo, hi } = priced.total;
  return {
    today: today / packets,
    mid: mid / packets,
    lo: lo / packets,
    hi: hi / packets,
    change: (mid - today) / packets,
  };
}

/** Parse the "rice packets a day" field: blank clears it, otherwise a whole number from 1 to 5,000. */
export function parsePackets(raw: FormDataEntryValue | null): { value: number | null } | { error: string } {
  const text = String(raw ?? "").replace(/,/g, "").trim();
  if (text === "") return { value: null };
  const n = Number(text);
  if (!Number.isInteger(n) || n < PACKETS_MIN || n > PACKETS_MAX) {
    return { error: "Rice packets a day must be a whole number from 1 to 5,000." };
  }
  return { value: n };
}

/** The signed-in owner's packets a day, or null when not set (or no kitchen). */
export async function getPacketsPerDay(userId: string): Promise<number | null> {
  const rows = await db()`
    select packets_per_day from subscribers where user_id = ${userId} and active limit 1`;
  const v = rows[0]?.packets_per_day;
  return v == null ? null : Number(v);
}
