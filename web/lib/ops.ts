import "server-only";
import { db } from "@/lib/db";
import type { Signal } from "@/lib/signals";

// Read-only queries for the admin ops console. Nothing here selects a subscriber's phone, email, token or
// message body. Not cached: an ops page should show the database as it is now.

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (v == null ? null : String(v));

/** ADMIN_EMAILS is a comma-separated list; matching ignores case and spaces. */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

export type SourceRow = {
  source: string;
  lastSuccessAt: string | null;
  lastDataDate: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
};

export type RunRow = {
  id: number;
  dataDate: string;
  createdAt: string;
  modelVersion: string;
  trainRows: number | null;
  total: number;
  signals: Record<Signal, number>;
};

export type ArchiveStats = {
  byStatus: Record<string, number>;
  total: number;
  firstReport: string | null;
  latestReport: string | null;
  latestParsed: string | null;
  lastFetchedAt: string | null;
};

export type ReviewDoc = {
  id: number;
  reportDate: string;
  fileName: string;
  status: string;
  sourceUrl: string;
  parseError: string | null;
  rules: { rule: string; count: number; example: Record<string, unknown> | null }[];
};

export type MessageRow = {
  id: number;
  createdAt: string;
  channel: string;
  status: string;
  kitchen: string | null;
};

export type Counts = {
  kitchens: number;
  activeKitchens: number;
  alertEvents: number | null;
  alertRules: number | null;
  messages: number;
  prices: number;
};

export async function getSources(): Promise<SourceRow[]> {
  const rows = await db()`
    select source,
           to_json(last_success_at) #>> '{}' as last_success_at,
           last_data_date::text as last_data_date,
           last_error,
           to_json(last_error_at) #>> '{}' as last_error_at
    from source_health order by source`;
  return rows.map((r) => ({
    source: String(r.source),
    lastSuccessAt: str(r.last_success_at),
    lastDataDate: str(r.last_data_date),
    lastError: str(r.last_error),
    lastErrorAt: str(r.last_error_at),
  }));
}

export async function getRecentRuns(limit = 20): Promise<RunRow[]> {
  const rows = await db()`
    select r.id::int as id, r.data_date::text as data_date, to_json(r.created_at) #>> '{}' as created_at,
           r.model_version, r.train_rows,
           count(f.run_id)::int as total,
           count(*) filter (where f.signal = 'spike')::int as spike,
           count(*) filter (where f.signal = 'rise')::int as rise,
           count(*) filter (where f.signal = 'steady')::int as steady,
           count(*) filter (where f.signal = 'fall')::int as fall,
           count(*) filter (where f.signal = 'no_forecast')::int as no_forecast
    from (select * from forecast_runs order by id desc limit ${limit}) r
    left join forecasts f on f.run_id = r.id
    group by r.id, r.data_date, r.created_at, r.model_version, r.train_rows
    order by r.id desc`;
  return rows.map((r) => ({
    id: Number(r.id),
    dataDate: String(r.data_date),
    createdAt: String(r.created_at),
    modelVersion: String(r.model_version),
    trainRows: r.train_rows == null ? null : Number(r.train_rows),
    total: Number(r.total),
    signals: {
      spike: Number(r.spike),
      rise: Number(r.rise),
      steady: Number(r.steady),
      fall: Number(r.fall),
      no_forecast: Number(r.no_forecast),
    },
  }));
}

export async function getArchiveStats(): Promise<ArchiveStats> {
  const [statusRows, summary] = await Promise.all([
    db()`select parse_status, count(*)::int as n from raw_documents group by parse_status`,
    db()`
      select count(*)::int as total,
             min(report_date)::text as first_report,
             max(report_date)::text as latest_report,
             max(report_date) filter (where parse_status = 'parsed')::text as latest_parsed,
             to_json(max(fetched_at)) #>> '{}' as last_fetched_at
      from raw_documents`,
  ]);
  const byStatus: Record<string, number> = { parsed: 0, review: 0, failed: 0, pending: 0 };
  for (const r of statusRows) byStatus[String(r.parse_status)] = Number(r.n);
  const s = summary[0] as Row;
  return {
    byStatus,
    total: Number(s.total ?? 0),
    firstReport: str(s.first_report),
    latestReport: str(s.latest_report),
    latestParsed: str(s.latest_parsed),
    lastFetchedAt: str(s.last_fetched_at),
  };
}

/** Failed and held-for-review CBSL reports, newest first, with the error rules that held them. */
export async function getReviewQueue(limit = 200): Promise<{ docs: ReviewDoc[]; total: number }> {
  const [docs, totalRows] = await Promise.all([
    db()`
      select d.id::int as id, d.report_date::text as report_date, d.file_name, d.parse_status, d.source_url,
             d.parse_error,
             coalesce((
               select json_agg(json_build_object('rule', x.rule, 'count', x.n, 'example', x.example) order by x.n desc)
               from (
                 select v.rule, count(*)::int as n, (array_agg(v.detail order by v.id))[1] as example
                 from validation_issues v
                 where v.source_doc_id = d.id and v.severity = 'error'
                 group by v.rule
               ) x
             ), '[]'::json) as rules
      from raw_documents d
      where d.parse_status in ('failed', 'review')
      order by d.report_date desc, d.id desc
      limit ${limit}`,
    db()`select count(*)::int as n from raw_documents where parse_status in ('failed', 'review')`,
  ]);
  return {
    total: Number(totalRows[0]?.n ?? 0),
    docs: docs.map((r) => {
      const rules = (typeof r.rules === "string" ? JSON.parse(r.rules) : r.rules) as ReviewDoc["rules"];
      return {
        id: Number(r.id),
        reportDate: String(r.report_date),
        fileName: String(r.file_name),
        status: String(r.parse_status),
        sourceUrl: String(r.source_url),
        parseError: str(r.parse_error),
        rules: Array.isArray(rules) ? rules : [],
      };
    }),
  };
}

/** The send log. Kitchen name only: never the phone number, email, token or message body. */
export async function getRecentMessages(limit = 50): Promise<MessageRow[]> {
  const rows = await db()`
    select m.id::int as id, to_json(m.created_at) #>> '{}' as created_at, m.channel, m.status, s.name as kitchen
    from messages m left join subscribers s on s.id = m.subscriber_id
    order by m.created_at desc, m.id desc
    limit ${limit}`;
  return rows.map((r) => ({
    id: Number(r.id),
    createdAt: String(r.created_at),
    channel: String(r.channel),
    status: String(r.status),
    kitchen: str(r.kitchen),
  }));
}

async function countOrNull(query: () => Promise<Row[]>): Promise<number | null> {
  try {
    return Number((await query())[0]?.n ?? 0);
  } catch {
    // alert tables arrive with migration 0004; before that there is nothing to count
    return null;
  }
}

export async function getCounts(): Promise<Counts> {
  const [kitchens, messages, prices, alertEvents, alertRules] = await Promise.all([
    db()`select count(*)::int as n, count(*) filter (where active)::int as active from subscribers`,
    db()`select count(*)::int as n from messages`,
    db()`select count(*)::int as n from prices`,
    countOrNull(() => db()`select count(*)::int as n from alert_events`),
    countOrNull(() => db()`select count(*)::int as n from alert_rules where active`),
  ]);
  return {
    kitchens: Number(kitchens[0]?.n ?? 0),
    activeKitchens: Number(kitchens[0]?.active ?? 0),
    messages: Number(messages[0]?.n ?? 0),
    prices: Number(prices[0]?.n ?? 0),
    alertEvents,
    alertRules,
  };
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "3 hours ago", "yesterday", "in 2 days". */
export function ago(ts: string | null | undefined, now = Date.now()): string {
  if (!ts) return "never";
  const secs = Math.round((Date.parse(ts) - now) / 1000);
  const abs = Math.abs(secs);
  if (abs < 45) return "just now";
  if (abs < 60 * 45) return rtf.format(Math.round(secs / 60), "minute");
  if (abs < 60 * 60 * 22) return rtf.format(Math.round(secs / 3600), "hour");
  if (abs < 86400 * 26) return rtf.format(Math.round(secs / 86400), "day");
  if (abs < 86400 * 320) return rtf.format(Math.round(secs / (86400 * 30)), "month");
  return rtf.format(Math.round(secs / (86400 * 365)), "year");
}
