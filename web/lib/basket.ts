import type { BoardRow } from "@/lib/types";

/** A typical 150-packet rice-and-curry kitchen, per day (kg; coconut in nuts). Used for the demo bill and as form defaults. */
export const DEFAULT_BASKET: Record<string, number> = {
  samba: 12,
  beans: 2,
  carrot: 2,
  cabbage: 2,
  pumpkin: 2,
  brinjal: 1.5,
  tomato: 1,
  green_chilli: 0.5,
  big_onion_imp: 2,
  red_onion_local: 1,
  potato_local: 2,
  red_dhal: 2,
  coconut: 15,
  dried_chilli_imp: 0.3,
  lime: 0.2,
};

export type BasketLine = {
  row: BoardRow;
  qty: number;
  today: number;
  mid: number;
  lo: number;
  hi: number;
  forecasted: boolean;
};

export type PricedBasket = {
  /** basket items Mila knows, in basket order */
  mine: BoardRow[];
  lines: BasketLine[];
  noPrice: BoardRow[];
  unknown: string[];
  total: { today: number; mid: number; lo: number; hi: number };
  flatCount: number;
  change: number | null;
  target: string | null;
  anyForecast: boolean;
};

/** Price one day of a basket at today's prices and at next week's forecast (middle guess and 80% range). */
export function priceBasket(rows: BoardRow[], basket: Record<string, number>): PricedBasket {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const mine = Object.keys(basket)
    .map((k) => byKey.get(k))
    .filter((r): r is BoardRow => r != null);
  const unknown = Object.keys(basket).filter((k) => !byKey.has(k));

  const lines: BasketLine[] = mine
    .filter((r) => r.latestPrice != null)
    .map((r) => {
      const amount = basket[r.key];
      const f = r.forecast;
      const ok = f != null && f.signal !== "no_forecast" && f.q10 != null && f.q50 != null && f.q90 != null;
      const p = r.latestPrice!;
      return {
        row: r,
        qty: amount,
        today: amount * p,
        mid: amount * (ok ? f.q50! : p),
        lo: amount * (ok ? Math.min(f.q10!, f.q50!) : p),
        hi: amount * (ok ? Math.max(f.q90!, f.q50!) : p),
        forecasted: ok,
      };
    });
  const noPrice = mine.filter((r) => r.latestPrice == null);
  const total = lines.reduce(
    (acc, l) => ({ today: acc.today + l.today, mid: acc.mid + l.mid, lo: acc.lo + l.lo, hi: acc.hi + l.hi }),
    { today: 0, mid: 0, lo: 0, hi: 0 },
  );
  const flatCount = lines.filter((l) => !l.forecasted).length;
  const change = total.today > 0 ? total.mid / total.today - 1 : null;
  const target = lines.find((l) => l.forecasted)?.row.forecast?.targetDate ?? null;
  return { mine, lines, noPrice, unknown, total, flatCount, change, target, anyForecast: lines.some((l) => l.forecasted) };
}
