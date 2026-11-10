import "server-only";
import { unstable_cache } from "next/cache";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getItems, getLiveScores } from "@/lib/data";
import { addDays, todayColombo } from "@/lib/format";

// ---------------------------------------------------------------- constants

export const API_SOURCE = "Central Bank of Sri Lanka Daily Price Report; weather: Open-Meteo (CC BY 4.0)";
export const API_NOTE = "Forecasts are estimates, not advice.";
export const MARKETS = ["pettah", "dambulla", "narahenpita", "marandagahamula"] as const;
export const PRICE_TYPES = ["wholesale", "retail"] as const;
export const ROW_LIMIT = 5000;
export const DEFAULT_DAYS = 90;
export const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=600";

/** Same 5-minute data cache as the rest of the app; the pipeline updates once each trading day. */
function cached<A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>) {
  return unstable_cache(fn, ["mila-api", name], { revalidate: 300, tags: ["mila"] });
}

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => (v == null ? null : Number(v));
const str = (v: unknown): string | null => (v == null ? null : String(v));
const round = (v: number | null, digits: number) => (v == null ? null : Number(v.toFixed(digits)));

// ---------------------------------------------------------------- responses

const BASE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "X-Data-Source",
  "X-Data-Source": `${API_SOURCE}. ${API_NOTE}`,
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status, headers: { ...BASE_HEADERS, "Cache-Control": "no-store" } });
}

export function jsonResponse(data: unknown, meta: Record<string, unknown> = {}) {
  return Response.json(
    {
      data,
      meta: { source: API_SOURCE, note: API_NOTE, generated_at: new Date().toISOString(), ...meta },
    },
    { headers: { ...BASE_HEADERS, "Cache-Control": CACHE_CONTROL } },
  );
}

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = Array.isArray(v) ? v.join(" | ") : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV: one header row, then data. Attribution travels in the X-Data-Source header. */
export function csvResponse(filename: string, columns: string[], rows: unknown[][]) {
  const body = [columns, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return new Response(body, {
    headers: {
      ...BASE_HEADERS,
      "Cache-Control": CACHE_CONTROL,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** Wraps a GET handler: parameter errors become 400s, anything else a logged 500. */
export function handler(fn: (req: NextRequest) => Promise<Response>) {
  return async (req: NextRequest) => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof ApiError) return errorResponse(e.status, e.code, e.message);
      console.error("api/v1", req.nextUrl.pathname, e);
      return errorResponse(500, "server_error", "Something went wrong reading the data. Try again in a minute.");
    }
  };
}

/** CORS preflight. Plain GETs need none, but a browser sending custom headers will ask first. */
export function preflight() {
  return new Response(null, {
    status: 204,
    headers: {
      ...BASE_HEADERS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}

// ---------------------------------------------------------------- parameters

function param(req: NextRequest, name: string): string | undefined {
  const all = req.nextUrl.searchParams.getAll(name);
  if (all.length > 1) throw new ApiError(400, "invalid_parameter", `Give ${name} once, not ${all.length} times.`);
  const v = all[0]?.trim();
  return v ? v : undefined;
}

export function parseFormat(req: NextRequest): "json" | "csv" {
  const v = param(req, "format")?.toLowerCase() ?? "json";
  if (v !== "json" && v !== "csv") throw new ApiError(400, "invalid_format", "format must be json or csv.");
  return v;
}

export function parseMarket(req: NextRequest): string | null {
  const v = param(req, "market")?.toLowerCase();
  if (v == null) return null;
  if (!(MARKETS as readonly string[]).includes(v)) {
    throw new ApiError(400, "invalid_market", `Unknown market "${v}". Use one of: ${MARKETS.join(", ")}.`);
  }
  return v;
}

export function parseType(req: NextRequest): string | null {
  const v = param(req, "type")?.toLowerCase();
  if (v == null) return null;
  if (!(PRICE_TYPES as readonly string[]).includes(v)) {
    throw new ApiError(400, "invalid_type", `Unknown type "${v}". Use one of: ${PRICE_TYPES.join(", ")}.`);
  }
  return v;
}

/** item=carrot or item=carrot,beans. Each key must be in the catalogue (/api/v1/items). */
export async function parseItems(req: NextRequest): Promise<string[] | null> {
  const v = param(req, "item")?.toLowerCase();
  if (v == null) return null;
  const keys = [...new Set(v.split(",").map((k) => k.trim()).filter(Boolean))];
  if (keys.length === 0) return null;
  if (keys.length > 50) throw new ApiError(400, "invalid_item", "Ask for at most 50 items at a time.");
  const known = new Set((await getItems()).map((i) => i.key));
  const unknown = keys.filter((k) => !known.has(k));
  if (unknown.length) {
    throw new ApiError(
      400,
      "invalid_item",
      `Unknown item ${unknown.map((k) => `"${k}"`).join(", ")}. See /api/v1/items for the item keys.`,
    );
  }
  return keys;
}

function parseDate(req: NextRequest, name: string): string | null {
  const v = param(req, name);
  if (v == null) return null;
  const d = new Date(`${v}T00:00:00Z`);
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  if (!ok) throw new ApiError(400, "invalid_date", `${name} must be a calendar date as YYYY-MM-DD, got "${v}".`);
  return v;
}

/** from/to, inclusive. Defaults to the last 90 days up to today (Sri Lanka time). */
export function parseRange(req: NextRequest): { from: string; to: string } {
  const fromParam = parseDate(req, "from");
  const toParam = parseDate(req, "to");
  const to = toParam ?? (fromParam ? maxDate(fromParam, todayColombo()) : todayColombo());
  const from = fromParam ?? addDays(to, -(DEFAULT_DAYS - 1));
  if (from > to) throw new ApiError(400, "invalid_range", `from (${from}) must be on or before to (${to}).`);
  return { from, to };
}

const maxDate = (a: string, b: string) => (a > b ? a : b);

// ---------------------------------------------------------------- queries

export type ApiItem = {
  key: string;
  name: string;
  category: string;
  unit: string;
  region: string | null;
  basket: boolean;
  series: { market: string; type: string; first_date: string; last_date: string; days: number }[];
};

const qSeries = cached(
  "series",
  async () =>
    (await db()`
      select item_key, market, price_type, min(obs_date)::text as first_date, max(obs_date)::text as last_date,
             count(*)::int as days
      from prices group by item_key, market, price_type
      order by item_key, market, price_type`) as Row[],
);

export async function apiItems(): Promise<ApiItem[]> {
  const [items, series] = await Promise.all([getItems(), qSeries()]);
  const byItem = new Map<string, ApiItem["series"]>();
  for (const r of series) {
    const k = String(r.item_key);
    if (!byItem.has(k)) byItem.set(k, []);
    byItem.get(k)!.push({
      market: String(r.market),
      type: String(r.price_type),
      first_date: String(r.first_date),
      last_date: String(r.last_date),
      days: Number(r.days),
    });
  }
  return items
    .map((i) => ({ ...i, series: byItem.get(i.key) ?? [] }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export type ApiPrice = { date: string; item: string; market: string; type: string; price: number; unit: string };

const qPrices = cached(
  "prices",
  async (from: string, to: string, items: string[] | null, market: string | null, type: string | null) =>
    (await db()`
      select p.obs_date::text as date, p.item_key as item, p.market, p.price_type as type,
             p.price::float8 as price, i.unit
      from prices p join items i on i.item_key = p.item_key
      where p.obs_date between ${from}::date and ${to}::date
        and (${items}::text[] is null or p.item_key = any(${items}::text[]))
        and (${market}::text is null or p.market = ${market}::text)
        and (${type}::text is null or p.price_type = ${type}::text)
      order by p.obs_date desc, p.item_key, p.market, p.price_type
      limit ${ROW_LIMIT + 1}`) as Row[],
);

/**
 * Prices newest first. When more than ROW_LIMIT rows match, the oldest (partial) day is dropped so the
 * caller can fetch the rest cleanly with to = nextTo.
 */
export async function apiPrices(
  from: string,
  to: string,
  items: string[] | null,
  market: string | null,
  type: string | null,
): Promise<{ rows: ApiPrice[]; truncated: boolean; nextTo: string | null }> {
  const raw = await qPrices(from, to, items, market, type);
  let rows: ApiPrice[] = raw.map((r) => ({
    date: String(r.date),
    item: String(r.item),
    market: String(r.market),
    type: String(r.type),
    price: Number(r.price),
    unit: String(r.unit),
  }));
  if (rows.length <= ROW_LIMIT) return { rows, truncated: false, nextTo: null };
  const overflowDate = rows[ROW_LIMIT].date;
  rows = rows.slice(0, ROW_LIMIT);
  const whole = rows.filter((r) => r.date !== overflowDate);
  if (whole.length) rows = whole;
  const oldest = rows[rows.length - 1].date;
  return { rows, truncated: true, nextTo: addDays(oldest, -1) };
}

export type ApiRun = {
  id: number;
  data_date: string;
  created_at: string;
  model_version: string;
  horizon_days: number;
  train_rows: number | null;
};

export type ApiForecast = {
  item: string;
  market: string;
  type: string;
  base_date: string;
  base_price: number;
  target_date: string;
  q10: number | null;
  q50: number | null;
  q90: number | null;
  spike_prob: number | null;
  signal: string;
  abstain_reason: string | null;
  drivers: string[];
};

const qLatestRun = cached("latest-run", async () => {
  const rows = await db()`
    select id::int as id, data_date::text as data_date, to_json(created_at) #>> '{}' as created_at,
           model_version, horizon_days, train_rows
    from forecast_runs order by id desc limit 1`;
  return (rows[0] as Row | undefined) ?? null;
});

const qRunForecasts = cached(
  "run-forecasts",
  async (runId: number, market: string | null, type: string | null) =>
    (await db()`
      select item_key, market, price_type, base_date::text as base_date, base_price::float8 as base_price,
             target_date::text as target_date, q10::float8 as q10, q50::float8 as q50, q90::float8 as q90,
             spike_prob::float8 as spike_prob, signal, abstain_reason, drivers
      from forecasts
      where run_id = ${runId}
        and (${market}::text is null or market = ${market}::text)
        and (${type}::text is null or price_type = ${type}::text)
      order by item_key, market, price_type`) as Row[],
);

function drivers(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string") {
    try {
      return drivers(JSON.parse(v));
    } catch {
      return v ? [v] : [];
    }
  }
  return [];
}

/** The newest forecast run and its rows. Never demo data: with no run, run is null and rows empty. */
export async function apiLatestForecasts(
  market: string | null,
  type: string | null,
): Promise<{ run: ApiRun | null; rows: ApiForecast[] }> {
  const r = await qLatestRun();
  if (!r) return { run: null, rows: [] };
  const run: ApiRun = {
    id: Number(r.id),
    data_date: String(r.data_date),
    created_at: String(r.created_at),
    model_version: String(r.model_version),
    horizon_days: Number(r.horizon_days),
    train_rows: num(r.train_rows),
  };
  const rows = (await qRunForecasts(run.id, market, type)).map((f) => ({
    item: String(f.item_key),
    market: String(f.market),
    type: String(f.price_type),
    base_date: String(f.base_date),
    base_price: Number(f.base_price),
    target_date: String(f.target_date),
    q10: num(f.q10),
    q50: num(f.q50),
    q90: num(f.q90),
    spike_prob: round(num(f.spike_prob), 4),
    signal: String(f.signal),
    abstain_reason: str(f.abstain_reason),
    drivers: drivers(f.drivers),
  }));
  return { run, rows };
}

const qBacktest = cached(
  "backtest",
  async () =>
    (await db()`
      select item_key, metric, value, to_json(created_at) #>> '{}' as created_at
      from backtest_scores where run_label = 'latest'
      order by item_key, metric`) as Row[],
);

export const METRIC_DEFINITIONS = {
  coverage80: "Share of real prices that landed inside the 80% range (q10 to q90). The target is 0.80.",
  mae_pct: "Typical miss: mean absolute gap between the middle guess (q50) and the real price, in percent.",
  mase: "Error of the middle guess divided by the error of a no-change guess. Below 1 beats no-change.",
  spike_recall: "Share of real spikes (a rise of 25% or more within 7 days) that Mila warned about.",
  spike_precision: "Share of spike warnings that came true.",
  n_forecasts: "Number of 7-day forecasts scored.",
  n_spikes: "Number of real spikes in the scored period.",
};

export async function apiTrackRecord() {
  const [rows, live] = await Promise.all([qBacktest(), getLiveScores()]);
  const overall: Record<string, number> = {};
  const model: Record<string, number> = {};
  const byItem = new Map<string, Record<string, number>>();
  let scoredAt: string | null = null;
  for (const r of rows) {
    if (r.value == null) continue;
    const key = String(r.item_key);
    const v = round(Number(r.value), 4)!;
    if (!scoredAt || String(r.created_at) > scoredAt) scoredAt = String(r.created_at);
    if (key === "_all") overall[String(r.metric)] = v;
    else if (key === "_model") model[String(r.metric)] = v;
    else {
      if (!byItem.has(key)) byItem.set(key, {});
      byItem.get(key)![String(r.metric)] = v;
    }
  }
  const items: ({ item: string } & Record<string, number | string>)[] = [...byItem].map(([item, metrics]) => ({
    item,
    ...metrics,
  }));
  // the pipeline stores counts per item only; add the totals so the headline is self-contained
  for (const k of ["n_forecasts", "n_spikes"] as const) {
    if (overall[k] == null && items.length) overall[k] = items.reduce((a, i) => a + Number(i[k] ?? 0), 0);
  }
  return {
    backtest: {
      run_label: "latest",
      scored_at: scoredAt,
      overall,
      model,
      items,
    },
    live:
      live == null
        ? null
        : {
            forecasts_scored: live.n,
            inside_80: round(live.inside80, 4),
            mean_abs_pct_error: round(live.meanAbsPctError, 4),
            spikes: live.spikes,
            spikes_caught: live.spikesCaught,
            warnings: live.warned,
            warnings_right: live.warnedRight,
            first_base_date: live.firstBase,
            last_target_date: live.lastTarget,
          },
  };
}

/** Headline numbers for the developer page. */
export const apiStats = cached("stats", async () => {
  const rows = await db()`
    select count(*)::int as prices, min(obs_date)::text as first_date, max(obs_date)::text as last_date,
           count(distinct market)::int as markets, count(distinct item_key)::int as items
    from prices`;
  const r = rows[0] as Row;
  return {
    prices: Number(r.prices),
    firstDate: String(r.first_date),
    lastDate: String(r.last_date),
    markets: Number(r.markets),
    items: Number(r.items),
  };
});
