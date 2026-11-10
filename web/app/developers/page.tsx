import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  API_NOTE,
  API_SOURCE,
  apiItems,
  apiLatestForecasts,
  apiPrices,
  apiStats,
  apiTrackRecord,
  DEFAULT_DAYS,
  MARKETS,
  PRICE_TYPES,
  ROW_LIMIT,
} from "@/lib/api";
import { addDays, dayYear } from "@/lib/format";
import { cn } from "@/lib/utils";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Data API",
  description:
    "Free, read-only JSON and CSV of the Central Bank of Sri Lanka daily food prices since 2016, with Mila's 7-day forecasts and track record.",
};

const BASE = "https://mila-taprona.vercel.app";
const int = new Intl.NumberFormat("en");

type Param = { name: string; values: string; fallback: string };

function Code({ children, className }: { children: string; className?: string }) {
  return (
    <pre
      className={cn(
        "overflow-x-auto rounded-lg border bg-muted/50 p-3.5 font-mono text-[12.5px] leading-relaxed text-foreground/90",
        className,
      )}
    >
      <code>{children}</code>
    </pre>
  );
}

function Inline({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>;
}

function Params({ params }: { params: Param[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Parameter</th>
            <th className="px-3 py-2 font-medium">Values</th>
            <th className="px-3 py-2 font-medium">Default</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {params.map((p) => (
            <tr key={p.name} className="align-top">
              <td className="px-3 py-2 font-mono text-[13px] whitespace-nowrap">{p.name}</td>
              <td className="px-3 py-2 leading-relaxed text-foreground/90">{p.values}</td>
              <td className="px-3 py-2 leading-relaxed text-muted-foreground">{p.fallback}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Endpoint({
  id,
  path,
  summary,
  params,
  curl,
  example,
  exampleNote,
  children,
}: {
  id: string;
  path: string;
  summary: React.ReactNode;
  params?: Param[];
  curl: string;
  example: unknown;
  exampleNote: string;
  children?: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-steady-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-steady">GET</span>
        <h3 className="font-mono text-[15px] font-semibold break-all">{path}</h3>
      </div>
      <div className="space-y-2 text-[15px] leading-relaxed text-foreground/90">{summary}</div>
      {params && params.length > 0 && <Params params={params} />}
      {children}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Example request</p>
        <Code>{curl}</Code>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Example response ({exampleNote})</p>
        <Code className="max-h-[420px]">{JSON.stringify(example, null, 2)}</Code>
      </div>
    </section>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

/** Real responses, trimmed to a few rows. Built from the same functions the endpoints use. */
async function examples() {
  const [stats, items, forecasts, record] = await Promise.all([
    apiStats(),
    apiItems(),
    apiLatestForecasts("pettah", "wholesale"),
    apiTrackRecord(),
  ]);
  const to = stats.lastDate;
  const from = addDays(to, -6);
  const prices = await apiPrices(from, to, ["carrot"], "pettah", "wholesale");
  const meta = <T extends Record<string, unknown>>(extra: T) => ({
    source: API_SOURCE,
    note: API_NOTE,
    generated_at: new Date().toISOString(),
    ...extra,
  });

  const carrot = items.find((i) => i.key === "carrot") ?? items[0];
  const itemsExample = {
    data: carrot ? [{ ...carrot, series: carrot.series.slice(0, 2) }] : [],
    meta: meta({ count: items.length, markets: MARKETS, types: PRICE_TYPES }),
  };

  const pricesExample = {
    data: prices.rows.slice(0, 3),
    meta: meta({
      count: prices.rows.length,
      query: { item: ["carrot"], market: "pettah", type: "wholesale", from, to },
      currency: "LKR",
      order: "newest first",
      row_limit: ROW_LIMIT,
      truncated: false,
    }),
  };

  const sample =
    forecasts.rows.find((f) => f.signal === "spike") ?? forecasts.rows.find((f) => f.signal !== "no_forecast");
  const abstained = forecasts.rows.find((f) => f.signal === "no_forecast");
  const forecastsExample = {
    data: { run: forecasts.run, forecasts: [sample, abstained].filter(Boolean) },
    meta: meta({ count: forecasts.rows.length, query: { market: "pettah", type: "wholesale" }, currency: "LKR" }),
  };

  const recordExample = {
    data: {
      backtest: { ...record.backtest, items: record.backtest.items.filter((i) => i.item === "carrot").slice(0, 1) },
      live: record.live,
    },
    meta: meta({ items: record.backtest.items.length }),
  };

  return { stats, from, to, itemsExample, pricesExample, forecastsExample, recordExample, nItems: items.length };
}

const TOC = [
  { href: "#items", label: "Items" },
  { href: "#prices", label: "Prices" },
  { href: "#forecasts", label: "Latest forecasts" },
  { href: "#track-record", label: "Track record" },
  { href: "#errors", label: "Errors" },
  { href: "#terms", label: "Terms" },
];

export default async function DevelopersPage() {
  const ex = await examples();
  const { stats } = ex;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-12 px-4 pt-12 pb-20 sm:px-6">
        <div className="space-y-4">
          <p className="text-sm font-medium text-brand">Developers</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Mila data API</h1>
          <p className="max-w-2xl text-[17px] leading-relaxed text-muted-foreground text-pretty">
            Sri Lanka&apos;s daily wholesale and retail food prices since 2016, cleaned and checked, plus Mila&apos;s
            7-day forecasts and how well they have done. Read-only JSON or CSV over HTTPS. No key, no sign-up.
          </p>
          <dl className="grid gap-3 pt-2 sm:grid-cols-4">
            {[
              { v: int.format(stats.prices), l: "validated daily prices" },
              { v: String(ex.nItems), l: "items: vegetables, rice, staples" },
              { v: String(stats.markets), l: "markets, wholesale and retail" },
              { v: dayYear(stats.lastDate), l: `latest report (from ${dayYear(stats.firstDate)})` },
            ].map((s) => (
              <div key={s.l} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                <dd className="tabular text-xl font-semibold tracking-tight">{s.v}</dd>
                <dt className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.l}</dt>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-sm">
            <span className="text-muted-foreground">Base URL</span>
            <Inline>{`${BASE}/api/v1`}</Inline>
          </div>
          <nav aria-label="On this page" className="flex flex-wrap gap-1.5 pt-1">
            {TOC.map((t) => (
              <a
                key={t.href}
                href={t.href}
                className="rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {t.label}
              </a>
            ))}
          </nav>
        </div>

        <Section title="What the data is">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Prices</strong> come from the Central Bank of Sri Lanka (CBSL) Daily Price Report: the
              &ldquo;today&rdquo; column for each item at Pettah, Dambulla, Narahenpita and Marandagahamula (rice), in
              rupees per unit. Each report is parsed and checked (units, ranges, day-to-day jumps, the report&apos;s own
              &ldquo;yesterday&rdquo; column); reports that fail a check are held back, not guessed.
            </li>
            <li>
              <strong>Forecasts</strong> are Mila&apos;s 7-day outlook for each item, market and price type: a middle
              guess (<Inline>q50</Inline>), an 80% range (<Inline>q10</Inline> to <Inline>q90</Inline>), the chance of
              a spike (a rise of 25% or more within 7 days) and a plain signal. They are built from the prices and from
              Open-Meteo rainfall in the growing areas, after each trading day&apos;s report.
            </li>
            <li>
              <strong>Track record</strong> is how those forecasts scored on a hold-out back-test, and live since
              launch.
            </li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Only derived data is served. Nothing about Mila&apos;s users is ever in the API. The method and its limits
            are on{" "}
            <Link href="/about" className="underline underline-offset-2">
              how Mila works
            </Link>
            .
          </p>
        </Section>

        <div className="space-y-6">
          <h2 className="text-xl font-semibold tracking-tight">Endpoints</h2>

          <Endpoint
            id="items"
            path="/api/v1/items"
            summary={
              <p>
                The item catalogue: key, name, category, unit and whether it is in the default eatery basket, with
                every market and price type the item has data for and the dates it covers. Use the{" "}
                <Inline>key</Inline> as <Inline>item</Inline> in the other endpoints.
              </p>
            }
            curl={`curl ${BASE}/api/v1/items`}
            example={ex.itemsExample}
            exampleNote={`1 of ${ex.nItems} items, 2 of its series`}
          />

          <Endpoint
            id="prices"
            path="/api/v1/prices"
            summary={
              <>
                <p>
                  Daily prices, newest first. One row per item, market, price type and trading day. Prices are in
                  rupees per <Inline>unit</Inline>.
                </p>
                <p className="text-sm text-muted-foreground">
                  At most {int.format(ROW_LIMIT)} rows per request. When more match, the response holds whole days
                  only, <Inline>meta.truncated</Inline> is <Inline>true</Inline> and <Inline>meta.next</Inline> is the
                  URL for the older rows.
                </p>
              </>
            }
            params={[
              { name: "item", values: "One item key, or several separated by commas (up to 50).", fallback: "All items" },
              { name: "market", values: MARKETS.join(", "), fallback: "All markets" },
              { name: "type", values: PRICE_TYPES.join(", "), fallback: "Both" },
              { name: "from", values: "Date, YYYY-MM-DD (inclusive)", fallback: `${DEFAULT_DAYS} days before to` },
              { name: "to", values: "Date, YYYY-MM-DD (inclusive). Must be on or after from.", fallback: "Today, Sri Lanka time" },
              { name: "format", values: "json or csv", fallback: "json" },
            ]}
            curl={[
              `curl "${BASE}/api/v1/prices?item=carrot&market=pettah&type=wholesale&from=${ex.from}&to=${ex.to}"`,
              "",
              "# the same as CSV",
              `curl -o carrot.csv "${BASE}/api/v1/prices?item=carrot&market=pettah&type=wholesale&from=${ex.from}&format=csv"`,
            ].join("\n")}
            example={ex.pricesExample}
            exampleNote={`first 3 of ${ex.pricesExample.meta.count} rows`}
          >
            <p className="text-sm text-muted-foreground">
              CSV columns: <Inline>date,item,market,type,price_lkr,unit</Inline>
            </p>
          </Endpoint>

          <Endpoint
            id="forecasts"
            path="/api/v1/forecasts/latest"
            summary={
              <>
                <p>
                  The newest forecast run (its id, the date of the prices it used, and the model version) and every
                  forecast in it. <Inline>base_price</Inline> is the price on <Inline>base_date</Inline>; the forecast
                  is for <Inline>target_date</Inline>, 7 days later.
                </p>
                <p className="text-sm text-muted-foreground">
                  <Inline>signal</Inline> is one of <Inline>spike</Inline>, <Inline>rise</Inline>,{" "}
                  <Inline>steady</Inline>, <Inline>fall</Inline> or <Inline>no_forecast</Inline>. When Mila abstains,
                  the estimates are null and <Inline>abstain_reason</Inline> says why. <Inline>drivers</Inline> are
                  short reasons built from the same data the model used.
                </p>
              </>
            }
            params={[
              { name: "market", values: MARKETS.join(", "), fallback: "All markets" },
              { name: "type", values: PRICE_TYPES.join(", "), fallback: "Both" },
              { name: "format", values: "json or csv (one row per forecast, drivers joined with \" | \")", fallback: "json" },
            ]}
            curl={`curl "${BASE}/api/v1/forecasts/latest?market=pettah&type=wholesale"`}
            example={ex.forecastsExample}
            exampleNote={`2 of ${ex.forecastsExample.meta.count} forecasts`}
          />

          <Endpoint
            id="track-record"
            path="/api/v1/track-record"
            summary={
              <p>
                How the forecasts have scored. <Inline>backtest.overall</Inline> is the hold-out back-test across all
                items, <Inline>backtest.items</Inline> is one row per item, and <Inline>live</Inline> scores every
                forecast published since launch once its target date has a CBSL report. <Inline>meta.definitions</Inline>{" "}
                explains each metric.
              </p>
            }
            curl={`curl ${BASE}/api/v1/track-record`}
            example={ex.recordExample}
            exampleNote={`1 of ${ex.recordExample.meta.items} items`}
          />
        </div>

        <Section id="errors" title="Responses and errors">
          <p>
            Every JSON response has the same shape: <Inline>data</Inline>, and <Inline>meta</Inline> with the source,
            a note that forecasts are estimates, <Inline>generated_at</Inline> and the query as it was understood.
            CSV responses are plain CSV with one header row; the attribution is in the <Inline>X-Data-Source</Inline>{" "}
            response header. All endpoints send <Inline>Access-Control-Allow-Origin: *</Inline>, so they work from a
            browser.
          </p>
          <p>
            A bad parameter returns <strong>400</strong> with a code and a message saying what to fix:
          </p>
          <Code>
            {[
              `curl "${BASE}/api/v1/prices?market=galle"`,
              "",
              JSON.stringify(
                {
                  error: {
                    code: "invalid_market",
                    message: `Unknown market "galle". Use one of: ${MARKETS.join(", ")}.`,
                  },
                },
                null,
                2,
              ),
            ].join("\n")}
          </Code>
          <p className="text-sm text-muted-foreground">
            Codes: <Inline>invalid_item</Inline>, <Inline>invalid_market</Inline>, <Inline>invalid_type</Inline>,{" "}
            <Inline>invalid_date</Inline>, <Inline>invalid_range</Inline>, <Inline>invalid_format</Inline>,{" "}
            <Inline>invalid_parameter</Inline>. A <strong>500</strong> with <Inline>server_error</Inline> means
            something failed on our side; try again shortly.
          </p>
        </Section>

        <Section title="Caching and limits">
          <p>
            The data changes once each trading day, after CBSL publishes that day&apos;s report. Responses are cached
            for 5 minutes (<Inline>Cache-Control: public, s-maxage=300, stale-while-revalidate=600</Inline>), so asking
            more often than that returns the same answer.
          </p>
          <p>
            There is no key and no hard rate limit during the pilot. Please cache on your side, ask for the date range
            you need rather than polling, and keep to a few requests a minute. Limits may be added later.
          </p>
        </Section>

        <Section id="terms" title="Terms">
          <p>
            Free to use with attribution to the{" "}
            <a
              href="https://www.cbsl.gov.lk/en/statistics/economic-indicators/price-report"
              className="underline underline-offset-2"
            >
              Central Bank of Sri Lanka Daily Price Report
            </a>{" "}
            and{" "}
            <a href="https://open-meteo.com/" className="underline underline-offset-2">
              Open-Meteo
            </a>{" "}
            (CC BY 4.0). For example: &ldquo;Prices: Central Bank of Sri Lanka. Weather: Open-Meteo. Forecasts:
            Mila.&rdquo;
          </p>
          <p>
            Forecasts are estimates, not advice. Prices at a local market can differ from the CBSL markets. The API is
            a free pilot, provided as is.
          </p>
        </Section>
      </main>
      <SiteFooter />
    </>
  );
}
