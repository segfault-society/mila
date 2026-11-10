import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { DEMO_SUBSCRIBER, DEMO_TOKEN, demoBacktest, demoEnabled, demoForecast, demoRun } from "@/lib/demo";
import type { Signal } from "@/lib/signals";
import type { BoardRow, Forecast, Health, Item, Point, Run, Subscriber } from "@/lib/types";

/** Every read is cached for 5 minutes; the pipeline updates once a day. */
const REVALIDATE = 300;

function cached<A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>) {
  return unstable_cache(fn, ["mila", name], { revalidate: REVALIDATE, tags: ["mila"] });
}

type Row = Record<string, unknown>;

const n = (v: unknown): number | null => (v == null ? null : Number(v));
const s = (v: unknown): string | null => (v == null ? null : String(v));

function toItem(r: Row): Item {
  return {
    key: String(r.item_key),
    name: String(r.display_name),
    category: String(r.category),
    unit: String(r.unit),
    region: s(r.region),
    basket: Boolean(r.basket),
  };
}

function toDrivers(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string") {
    try {
      return toDrivers(JSON.parse(v));
    } catch {
      return v ? [v] : [];
    }
  }
  return [];
}

function toForecast(r: Row): Forecast {
  return {
    itemKey: String(r.item_key),
    market: String(r.market),
    priceType: String(r.price_type),
    baseDate: String(r.base_date),
    basePrice: Number(r.base_price),
    targetDate: String(r.target_date),
    q10: n(r.q10),
    q50: n(r.q50),
    q90: n(r.q90),
    spikeProb: n(r.spike_prob),
    signal: String(r.signal) as Signal,
    abstainReason: s(r.abstain_reason),
    drivers: toDrivers(r.drivers),
  };
}

// ---------------------------------------------------------------- raw queries (cached)

const qItems = cached("items", async (): Promise<Item[]> => {
  const rows = await db()`
    select item_key, display_name, category, unit, region, basket
    from items order by display_name`;
  return rows.map(toItem);
});

const qRealRun = cached("run", async (): Promise<Run | null> => {
  const rows = await db()`
    select id::int as id, to_json(created_at) #>> '{}' as created_at, data_date::text as data_date,
           model_version, horizon_days
    from forecast_runs order by id desc limit 1`;
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    createdAt: String(r.created_at),
    dataDate: String(r.data_date),
    modelVersion: String(r.model_version),
    horizonDays: Number(r.horizon_days),
    demo: false,
  };
});

const qHealth = cached("health", async (): Promise<Health[]> => {
  const rows = await db()`
    select source,
           to_json(last_success_at) #>> '{}' as last_success_at,
           last_data_date::text as last_data_date,
           last_error,
           to_json(last_error_at) #>> '{}' as last_error_at
    from source_health`;
  return rows.map((r) => ({
    source: String(r.source),
    lastSuccessAt: s(r.last_success_at),
    lastDataDate: s(r.last_data_date),
    lastError: s(r.last_error),
    lastErrorAt: s(r.last_error_at),
  }));
});

const qLatestPrices = cached(
  "latest",
  async (market: string, type: string) =>
    (await db()`
      select l.item_key, l.obs_date::text as obs_date, l.price::float8 as price,
             (select w.price::float8 from prices w
               where w.item_key = l.item_key and w.market = ${market} and w.price_type = ${type}
                 and w.obs_date <= l.obs_date - 7 and w.obs_date >= l.obs_date - 14
               order by w.obs_date desc limit 1) as week_ago
      from (
        select distinct on (item_key) item_key, obs_date, price
        from prices
        where market = ${market} and price_type = ${type}
        order by item_key, obs_date desc
      ) l`) as Row[],
);

const qSparks = cached(
  "sparks",
  async (market: string, type: string) =>
    (await db()`
      select item_key, obs_date::text as d, price::float8 as p
      from prices
      where market = ${market} and price_type = ${type}
        and obs_date > (select max(obs_date) from prices where market = ${market} and price_type = ${type}) - 42
      order by item_key, obs_date`) as Row[],
);

const qForecasts = cached(
  "forecasts",
  async (runId: number, market: string, type: string) =>
    (await db()`
      select item_key, market, price_type, base_date::text as base_date, base_price::float8 as base_price,
             target_date::text as target_date, q10::float8 as q10, q50::float8 as q50, q90::float8 as q90,
             spike_prob::float8 as spike_prob, signal, abstain_reason, drivers
      from forecasts
      where run_id = ${runId} and market = ${market} and price_type = ${type}`) as Row[],
);

const qItemForecasts = cached(
  "item-forecasts",
  async (runId: number, itemKey: string) =>
    (await db()`
      select item_key, market, price_type, base_date::text as base_date, base_price::float8 as base_price,
             target_date::text as target_date, q10::float8 as q10, q50::float8 as q50, q90::float8 as q90,
             spike_prob::float8 as spike_prob, signal, abstain_reason, drivers
      from forecasts
      where run_id = ${runId} and item_key = ${itemKey}`) as Row[],
);

const qHistory = cached(
  "history",
  async (itemKey: string, market: string, type: string, days: number) =>
    (await db()`
      select obs_date::text as d, price::float8 as p
      from prices
      where item_key = ${itemKey} and market = ${market} and price_type = ${type}
        and obs_date > (select max(obs_date) from prices
                        where item_key = ${itemKey} and market = ${market} and price_type = ${type}) - ${days}::int
      order by obs_date`) as Row[],
);

const qAcrossMarkets = cached(
  "across",
  async (itemKey: string) =>
    (await db()`
      select distinct on (market, price_type) market, price_type, obs_date::text as obs_date, price::float8 as price
      from prices
      where item_key = ${itemKey}
      order by market, price_type, obs_date desc`) as Row[],
);

const qBacktest = cached(
  "backtest",
  async (itemKey: string) =>
    (await db()`
      select run_label, metric, value
      from backtest_scores
      where item_key = ${itemKey}
        and run_label = (select run_label from backtest_scores where item_key = ${itemKey}
                         order by created_at desc limit 1)`) as Row[],
);

// ---------------------------------------------------------------- public API

export async function getItems(): Promise<Item[]> {
  return qItems();
}

export async function getItem(key: string): Promise<Item | null> {
  return (await qItems()).find((i) => i.key === key) ?? null;
}

export async function getHealth(): Promise<Health[]> {
  return qHealth();
}

/** Latest forecast run, or a fake demo run when MILA_DEMO=1 locally and the table is still empty. */
export async function getRun(fallbackDataDate?: string | null): Promise<Run | null> {
  const run = await qRealRun();
  if (run) return run;
  if (demoEnabled() && fallbackDataDate) return demoRun(fallbackDataDate);
  return null;
}

async function forecastsFor(run: Run | null, market: string, type: string, latest: Map<string, Row>) {
  const out = new Map<string, Forecast>();
  if (!run) return out;
  if (run.demo) {
    for (const [key, r] of latest) {
      out.set(key, demoForecast(key, market, type, String(r.obs_date), Number(r.price)));
    }
    return out;
  }
  for (const r of await qForecasts(run.id, market, type)) out.set(String(r.item_key), toForecast(r));
  return out;
}

/** Every item with its latest price, week-ago price, 6-week sparkline and forecast for one market view. */
export async function getBoard(market: string, type: string) {
  const [items, latestRows, sparkRows] = await Promise.all([
    qItems(),
    qLatestPrices(market, type),
    qSparks(market, type),
  ]);
  const latest = new Map(latestRows.map((r) => [String(r.item_key), r]));
  const marketLatest = latestRows.reduce<string | null>(
    (m, r) => (m == null || String(r.obs_date) > m ? String(r.obs_date) : m),
    null,
  );
  const run = await getRun(marketLatest);
  const forecasts = await forecastsFor(run, market, type, latest);

  const sparks = new Map<string, Point[]>();
  for (const r of sparkRows) {
    const k = String(r.item_key);
    if (!sparks.has(k)) sparks.set(k, []);
    sparks.get(k)!.push({ d: String(r.d), p: Number(r.p) });
  }

  const rows: BoardRow[] = items.map((it) => {
    const l = latest.get(it.key);
    return {
      ...it,
      latestDate: l ? String(l.obs_date) : null,
      latestPrice: l ? Number(l.price) : null,
      weekAgoPrice: l ? n(l.week_ago) : null,
      spark: sparks.get(it.key) ?? [],
      forecast: forecasts.get(it.key) ?? null,
    };
  });
  return { rows, run, marketLatest };
}

export async function getHistory(itemKey: string, market: string, type: string, days = 56): Promise<Point[]> {
  const rows = await qHistory(itemKey, market, type, days);
  return rows.map((r) => ({ d: String(r.d), p: Number(r.p) }));
}

/** Latest price (and forecast, if any) for one item in every market / price type. */
export async function getItemAcrossMarkets(itemKey: string, run: Run | null) {
  const rows = await qAcrossMarkets(itemKey);
  const newest = rows.reduce((m, r) => (String(r.obs_date) > m ? String(r.obs_date) : m), "");
  let forecasts = new Map<string, Forecast>();
  if (run?.demo) {
    for (const r of rows) {
      const f = demoForecast(itemKey, String(r.market), String(r.price_type), String(r.obs_date), Number(r.price));
      forecasts.set(`${r.market}|${r.price_type}`, f);
    }
  } else if (run) {
    forecasts = new Map(
      (await qItemForecasts(run.id, itemKey)).map((r) => [`${r.market}|${r.price_type}`, toForecast(r)]),
    );
  }
  return rows
    .filter((r) => {
      // hide series CBSL stopped reporting (e.g. Narahenpita wholesale, 2020 only)
      const age = (Date.parse(newest) - Date.parse(String(r.obs_date))) / 86_400_000;
      return age <= 60;
    })
    .map((r) => ({
      market: String(r.market),
      priceType: String(r.price_type),
      date: String(r.obs_date),
      price: Number(r.price),
      forecast: forecasts.get(`${r.market}|${r.price_type}`) ?? null,
    }));
}

export async function getForecast(run: Run | null, itemKey: string, market: string, type: string) {
  if (!run) return null;
  if (run.demo) {
    const latest = new Map((await qLatestPrices(market, type)).map((r) => [String(r.item_key), r]));
    const l = latest.get(itemKey);
    return l ? demoForecast(itemKey, market, type, String(l.obs_date), Number(l.price)) : null;
  }
  const f = (await qForecasts(run.id, market, type)).find((r) => r.item_key === itemKey);
  return f ? toForecast(f) : null;
}

/** Latest backtest scorecard for an item: { coverage80, spike_precision, spike_recall, mae_pct }. */
export async function getBacktest(itemKey: string, run: Run | null) {
  const rows = await qBacktest(itemKey);
  if (rows.length) {
    const metrics: Record<string, number> = {};
    for (const r of rows) if (r.value != null) metrics[String(r.metric)] = Number(r.value);
    return { runLabel: String(rows[0].run_label), metrics, demo: false };
  }
  if (run?.demo) {
    const m = demoBacktest(itemKey);
    return m ? { runLabel: "demo (fake)", metrics: m, demo: true } : null;
  }
  return null;
}

/** Owner lookup by private token. Never selects the phone number. */
export async function getSubscriber(token: string): Promise<Subscriber | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(token)) return null;
  const rows = await db()`
    select id::int as id, name, market, price_type, basket
    from subscribers where token = ${token} and active limit 1`;
  const r = rows[0];
  if (r) {
    const basket: Record<string, number> = {};
    const raw = (typeof r.basket === "string" ? JSON.parse(r.basket) : r.basket) as Record<string, unknown>;
    for (const [k, v] of Object.entries(raw ?? {})) {
      const q = Number(v);
      if (Number.isFinite(q) && q > 0) basket[k] = q;
    }
    return {
      id: Number(r.id),
      name: String(r.name),
      market: String(r.market),
      priceType: String(r.price_type),
      basket,
    };
  }
  if (token === DEMO_TOKEN && demoEnabled()) return DEMO_SUBSCRIBER;
  return null;
}

/** The signed-in owner's kitchen (one per account), or null. */
export async function getKitchenForUser(userId: string): Promise<(Subscriber & { token: string }) | null> {
  const rows = await db()`
    select token from subscribers where user_id = ${userId} and active limit 1`;
  const token = rows[0]?.token;
  if (!token) return null;
  const sub = await getSubscriber(String(token));
  return sub ? { ...sub, token: String(token) } : null;
}

const qScores = cached(
  "scores",
  async () =>
    (await db()`
      select item_key, metric, value, to_json(created_at) #>> '{}' as created_at
      from backtest_scores where run_label = 'latest'`) as Row[],
);

export type Scorecard = {
  overall: Record<string, number>;
  items: { key: string; metrics: Record<string, number> }[];
  nForecasts: number;
  scoredAt: string | null;
};

/** The hold-out back-test ("latest"): overall metrics (item '_all') and one row per item. */
export async function getScorecard(): Promise<Scorecard> {
  const rows = await qScores();
  const overall: Record<string, number> = {};
  const byItem = new Map<string, Record<string, number>>();
  let scoredAt: string | null = null;
  for (const r of rows) {
    if (r.value == null) continue;
    const key = String(r.item_key);
    const v = Number(r.value);
    if (!scoredAt || String(r.created_at) > scoredAt) scoredAt = String(r.created_at);
    if (key === "_all") overall[String(r.metric)] = v;
    else {
      if (!byItem.has(key)) byItem.set(key, {});
      byItem.get(key)![String(r.metric)] = v;
    }
  }
  const items = [...byItem].map(([key, metrics]) => ({ key, metrics }));
  const nForecasts = items.reduce((a, i) => a + (i.metrics.n_forecasts ?? 0), 0);
  return { overall, items, nForecasts, scoredAt };
}

export type LiveScores = {
  n: number;
  inside80: number | null;
  meanAbsPctError: number | null;
  spikes: number;
  spikesCaught: number;
  warned: number;
  warnedRight: number;
  firstBase: string | null;
  lastTarget: string | null;
};

const qLive = cached("live-scores", async () => {
  const rows = await db()`
    select count(*)::int as n,
           avg(case when inside_80 then 1.0 else 0.0 end)::float8 as inside80,
           avg(abs_pct_error)::float8 as mape,
           count(*) filter (where spiked)::int as spikes,
           count(*) filter (where spiked and warned)::int as caught,
           count(*) filter (where warned)::int as warned,
           count(*) filter (where warned and spiked)::int as warned_right,
           min(base_date)::text as first_base,
           max(target_date)::text as last_target
    from live_scores`;
  return rows[0] as Row;
});

/** Forecasts made since the pilot went live, scored against the real price on their target date. Null if unavailable. */
export async function getLiveScores(): Promise<LiveScores | null> {
  try {
    const r = await qLive();
    return {
      n: Number(r.n ?? 0),
      inside80: n(r.inside80),
      meanAbsPctError: n(r.mape),
      spikes: Number(r.spikes ?? 0),
      spikesCaught: Number(r.caught ?? 0),
      warned: Number(r.warned ?? 0),
      warnedRight: Number(r.warned_right ?? 0),
      firstBase: s(r.first_base),
      lastTarget: s(r.last_target),
    };
  } catch {
    // the view arrives with migration 0003; before that there is nothing to show
    return null;
  }
}
