import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { MarketPicker } from "@/components/market-picker";
import { Freshness } from "@/components/freshness";
import { DemoBanner, Notice } from "@/components/notice";
import { SignalBadge } from "@/components/signal-badge";
import { FanChart, type FanForecast } from "@/components/fan-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getBacktest,
  getForecast,
  getHealth,
  getHistory,
  getItem,
  getItemAcrossMarkets,
  getRun,
} from "@/lib/data";
import { day, dayLong, pct, perUnit, rs, rsRange, sentenceCase, signedPct, todayColombo } from "@/lib/format";
import { MARKET_VIEWS, marketName, resolveView, viewQuery } from "@/lib/markets";
import { cn } from "@/lib/utils";

export const revalidate = 300;

const REGION: Record<string, string> = {
  upcountry: "Grown mostly in the up-country hills (Nuwara Eliya, Badulla)",
  dryzone: "Grown mostly in the dry zone",
  north: "Grown mostly in the north (Jaffna)",
};

export async function generateMetadata(props: PageProps<"/item/[key]">): Promise<Metadata> {
  const { key } = await props.params;
  const item = await getItem(key);
  return { title: item ? `${item.name} price outlook` : "Item not found" };
}

function mae(v: number): string {
  // mae_pct may arrive as a fraction (0.083) or a percentage (8.3)
  const p = v <= 1 ? v * 100 : v;
  return `±${p.toFixed(p < 10 ? 1 : 0)}%`;
}

export default async function ItemPage(props: PageProps<"/item/[key]">) {
  const [{ key }, sp] = await Promise.all([props.params, props.searchParams]);
  const item = await getItem(key);
  if (!item) notFound();

  const requested = resolveView(sp);
  const today = todayColombo();
  const [health, run] = await Promise.all([getHealth(), getRun(today)]);
  const markets = await getItemAcrossMarkets(key, run);

  const available = new Set(markets.map((r) => `${r.market}|${r.priceType}`));
  // if the item is not sold in the requested market, fall back to the first one that has it
  const view =
    available.has(`${requested.market}|${requested.type}`) || available.size === 0
      ? requested
      : (MARKET_VIEWS.find((v) => available.has(`${v.market}|${v.type}`)) ?? requested);
  const q = viewQuery(view);

  const [history, forecast, backtest] = await Promise.all([
    getHistory(key, view.market, view.type, 56),
    getForecast(run, key, view.market, view.type),
    getBacktest(key, run),
  ]);

  const latest = history[history.length - 1] ?? null;
  const usable = forecast && forecast.signal !== "no_forecast" && forecast.q10 != null && forecast.q50 != null && forecast.q90 != null;
  const fan: FanForecast | null = usable
    ? {
        baseDate: forecast.baseDate,
        basePrice: forecast.basePrice,
        targetDate: forecast.targetDate,
        // guard against quantile crossing so the fan always contains the middle guess
        q10: Math.min(forecast.q10!, forecast.q50!),
        q50: forecast.q50!,
        q90: Math.max(forecast.q90!, forecast.q50!),
        signal: forecast.signal,
      }
    : null;
  const change = usable ? forecast.q50! / forecast.basePrice - 1 : null;

  return (
    <>
      <SiteHeader homeHref={`/${q}`} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-10">
        <Link
          href={`/${q}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> All prices
        </Link>

        <section className="mt-3 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{item.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.category === "rice" ? "Rice" : item.category === "vegetable" ? "Vegetable" : sentenceCase(item.category)}{" "}
                · priced {perUnit(item.unit) === "each" ? "each" : `per ${item.unit}`}
                {item.region && REGION[item.region] ? ` · ${REGION[item.region]}` : ""}
                {item.basket ? " · in the eatery basket" : ""}
              </p>
            </div>
            {run ? (
              <SignalBadge signal={forecast?.signal ?? "no_forecast"} size="lg" />
            ) : null}
          </div>
          <Freshness health={health} run={run} />
          {available.size > 0 && <MarketPicker current={view} basePath={`/item/${key}`} available={available} />}
          {run?.demo && <DemoBanner />}
        </section>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="gap-3">
            <CardHeader>
              <CardDescription>{view.label}</CardDescription>
              <CardTitle className="flex flex-wrap items-baseline gap-x-2 text-base">
                <span className="tabular text-2xl font-semibold tracking-tight">{rs(latest?.p)}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {perUnit(item.unit)} on {dayLong(latest?.d)}
                </span>
              </CardTitle>
              {usable ? (
                <p className="text-sm leading-relaxed">
                  By <span className="font-medium">{day(forecast.targetDate)}</span>: about{" "}
                  <span className="tabular font-semibold">{rs(forecast.q50)}</span>{" "}
                  <span className={cn("tabular", change! >= 0.05 ? "text-spike" : change! <= -0.05 ? "text-fall" : "text-muted-foreground")}>
                    ({signedPct(change)})
                  </span>
                  . 8 in 10 chance it lands between{" "}
                  <span className="tabular font-medium">{rsRange(fan!.q10, fan!.q90)}</span>
                  {forecast.spikeProb != null && (
                    <>
                      . Chance of a 25%+ spike:{" "}
                      <span className={cn("tabular font-semibold", forecast.spikeProb >= 0.5 && "text-spike")}>
                        {pct(forecast.spikeProb)}
                      </span>
                    </>
                  )}
                  .
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {!run
                    ? "Forecasts not yet available — latest prices shown."
                    : forecast?.abstainReason
                      ? `No forecast: ${forecast.abstainReason}.`
                      : "Mila does not forecast this item in this market yet."}
                </p>
              )}
            </CardHeader>
            <CardContent className="px-2 sm:px-4">
              <FanChart history={history} forecast={fan} today={today} />
              <p className="mt-2 px-2 text-xs text-muted-foreground sm:px-0">
                Last 8 weeks of daily prices{fan ? "; shaded fan = Mila's 80% range for the next 7 days, dashed line = middle guess" : ""}.
              </p>
            </CardContent>
          </Card>

          <div className="grid content-start gap-4">
            <Card size="sm">
              <CardHeader>
                <CardTitle>Why Mila thinks so</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {usable && forecast.drivers.length > 0 ? (
                  <ul className="space-y-2">
                    {forecast.drivers.map((d, i) => (
                      <li key={i} className="flex gap-2 leading-snug">
                        <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/50" />
                        {d}
                      </li>
                    ))}
                  </ul>
                ) : forecast?.signal === "no_forecast" ? (
                  <div className="space-y-3">
                    <p className="leading-relaxed text-muted-foreground">
                      Mila stays silent on {item.name.toLowerCase()} this week:{" "}
                      <span className="text-foreground">{forecast.abstainReason ?? "no reason recorded"}</span>. A
                      wrong warning costs more than no warning.
                    </p>
                    {forecast.drivers.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-muted-foreground">What Mila is seeing</p>
                        <ul className="space-y-2">
                          {forecast.drivers.map((d, i) => (
                            <li key={i} className="flex gap-2 leading-snug">
                              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/40" />
                              {d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    {run ? "No reasons recorded for this forecast." : "Reasons appear here once forecasts are published."}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Mila&apos;s record on {item.name.toLowerCase()}</CardTitle>
                {backtest && (
                  <CardDescription>
                    Back-test {backtest.demo ? "(fake demo numbers)" : `“${backtest.runLabel}”`} on past prices
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="text-sm">
                {backtest && Object.keys(backtest.metrics).length > 0 ? (
                  <dl className="grid grid-cols-2 gap-3">
                    {backtest.metrics.coverage80 != null && (
                      <div>
                        <dt className="text-xs text-muted-foreground">Inside the 80% range</dt>
                        <dd className="tabular text-lg font-semibold">{pct(backtest.metrics.coverage80)}</dd>
                      </div>
                    )}
                    {backtest.metrics.mae_pct != null && (
                      <div>
                        <dt className="text-xs text-muted-foreground">Typical miss</dt>
                        <dd className="tabular text-lg font-semibold">{mae(backtest.metrics.mae_pct)}</dd>
                      </div>
                    )}
                    {backtest.metrics.spike_precision != null && (
                      <div>
                        <dt className="text-xs text-muted-foreground">Spike warnings that came true</dt>
                        <dd className="tabular text-lg font-semibold">{pct(backtest.metrics.spike_precision)}</dd>
                      </div>
                    )}
                    {backtest.metrics.spike_recall != null && (
                      <div>
                        <dt className="text-xs text-muted-foreground">Real spikes Mila caught</dt>
                        <dd className="tabular text-lg font-semibold">{pct(backtest.metrics.spike_recall)}</dd>
                      </div>
                    )}
                  </dl>
                ) : (
                  <p className="text-muted-foreground">Back-test results will appear here once the model is scored.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="mt-4" size="sm">
          <CardHeader>
            <CardTitle>{item.name} in every market</CardTitle>
            <CardDescription>Latest CBSL price for each market and price type</CardDescription>
          </CardHeader>
          <CardContent>
            {markets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent prices.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Market</TableHead>
                    <TableHead className="text-right">Latest</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Date</TableHead>
                    {run && <TableHead className="text-right">Next 7 days</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {markets.map((r) => {
                    const active = r.market === view.market && r.priceType === view.type;
                    return (
                      <TableRow key={`${r.market}|${r.priceType}`} className={cn(active && "bg-muted/60")}>
                        <TableCell>
                          <Link
                            href={`/item/${key}${viewQuery({ market: r.market, type: r.priceType })}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {marketName(r.market)} <span className="text-muted-foreground">{r.priceType}</span>
                          </Link>
                          <span className="block text-xs text-muted-foreground sm:hidden">{day(r.date)}</span>
                        </TableCell>
                        <TableCell className="tabular text-right font-medium">{rs(r.price)}</TableCell>
                        <TableCell className="tabular hidden text-right text-muted-foreground sm:table-cell">
                          {day(r.date)}
                        </TableCell>
                        {run && (
                          <TableCell className="text-right">
                            <SignalBadge signal={r.forecast?.signal ?? "no_forecast"} size="sm" />
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {!run && (
          <Notice className="mt-4">
            Forecasts not yet available — latest prices shown. Mila publishes a new 7-day outlook each
            morning after the Central Bank report.
          </Notice>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
