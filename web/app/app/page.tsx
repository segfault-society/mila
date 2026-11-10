import type { Metadata } from "next";
import Link from "next/link";
import { ChefHat, ChevronRight } from "lucide-react";
import { Freshness } from "@/components/freshness";
import { CostTiles } from "@/components/kitchen-view";
import { DemoBanner } from "@/components/notice";
import { SignalBadge } from "@/components/signal-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { priceBasket } from "@/lib/basket";
import { getBoard, getHealth, getKitchenForUser, getScorecard } from "@/lib/data";
import { day, pct, perUnit, rs, TZ } from "@/lib/format";
import { DEFAULT_VIEW, viewLabel, viewQuery } from "@/lib/markets";
import { signalRank } from "@/lib/signals";
import type { BoardRow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Overview" };

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: TZ }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Items to watch: spike risk first (highest chance first), then mild rises. */
function warnings(rows: BoardRow[], only?: Set<string>): BoardRow[] {
  return rows
    .filter((r) => (only ? only.has(r.key) : r.basket))
    .filter((r) => r.forecast && (r.forecast.signal === "spike" || r.forecast.signal === "rise"))
    .sort(
      (a, b) =>
        signalRank(a.forecast!.signal) - signalRank(b.forecast!.signal) ||
        (b.forecast!.spikeProb ?? 0) - (a.forecast!.spikeProb ?? 0),
    );
}

export default async function OverviewPage() {
  const user = await requireUser();
  const kitchen = await getKitchenForUser(user.id);
  const market = kitchen?.market ?? DEFAULT_VIEW.market;
  const type = kitchen?.priceType ?? DEFAULT_VIEW.type;
  const label = viewLabel(market, type);
  const q = viewQuery({ market, type });

  const [board, health, card] = await Promise.all([getBoard(market, type), getHealth(), getScorecard()]);
  const hasRun = board.run != null;
  const watch = warnings(board.rows, kitchen ? new Set(Object.keys(kitchen.basket)) : undefined);
  const spikeCount = watch.filter((r) => r.forecast?.signal === "spike").length;
  const priced = kitchen ? priceBasket(board.rows, kitchen.basket) : null;
  const first = user.name?.split(" ")[0];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {greeting()}
            {first ? `, ${first}` : ""}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasRun
              ? spikeCount > 0
                ? `${spikeCount} item${spikeCount === 1 ? "" : "s"} ${kitchen ? "in your basket " : ""}could jump 25% or more by ${day(watch[0].forecast?.targetDate)}.`
                : `No spike warnings ${kitchen ? "for your basket " : ""}at ${label} this week.`
              : "Forecasts not yet available. Latest prices shown."}
          </p>
        </div>
        <Freshness health={health} run={board.run} />
      </section>
      {board.run?.demo && <DemoBanner />}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-4">
          {kitchen && priced ? (
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{kitchen.name}</CardTitle>
                  <CardDescription>One day of your basket at {label}</CardDescription>
                </div>
                <Link href="/app/kitchen" className="inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
                  Open kitchen <ChevronRight className="size-4" aria-hidden />
                </Link>
              </CardHeader>
              <CardContent>
                <CostTiles priced={priced} hasRun={hasRun} marketLatest={board.marketLatest} compact />
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-brand-soft/50 ring-brand/20">
              <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-background text-brand ring-1 ring-brand/20">
                  <ChefHat className="size-5" aria-hidden />
                </span>
                <div className="flex-1">
                  <p className="font-medium">Set up your kitchen</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Add the items you buy and how much a day. Mila will price your basket for next week and only warn you
                    about what you actually buy. Until then you see the standard eatery basket at Pettah wholesale.
                  </p>
                </div>
                <Link
                  href="/app/kitchen"
                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-foreground px-3.5 text-sm font-medium text-background shadow-xs transition hover:bg-foreground/85"
                >
                  Set up kitchen
                </Link>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">This week&apos;s warnings</CardTitle>
                <CardDescription>
                  {kitchen ? "Items in your basket" : "Eatery basket"} at {label}
                  {board.marketLatest ? `, prices to ${day(board.marketLatest)}` : ""}
                </CardDescription>
              </div>
              <Link href={`/app/prices${q}`} className="inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
                All prices <ChevronRight className="size-4" aria-hidden />
              </Link>
            </CardHeader>
            <CardContent className="px-0">
              {!hasRun ? (
                <p className="px-4 text-sm text-muted-foreground">Warnings appear here once the day&apos;s forecast is published.</p>
              ) : watch.length === 0 ? (
                <p className="px-4 text-sm text-muted-foreground">
                  Nothing to watch: every item is steady, falling, or Mila is staying silent on it this week.
                </p>
              ) : (
                <ul className="divide-y border-y">
                  {watch.slice(0, 6).map((r) => {
                    const f = r.forecast!;
                    return (
                      <li key={r.key}>
                        <Link
                          href={`/app/items/${r.key}${q}`}
                          className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-muted/50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{r.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {f.drivers[0] ?? `Middle guess ${rs(f.q50)} ${perUnit(r.unit)} by ${day(f.targetDate)}`}
                            </span>
                          </span>
                          <span className="flex flex-col items-end gap-1">
                            <SignalBadge signal={f.signal} prob={f.spikeProb} size="sm" />
                            <span className="tabular text-xs text-muted-foreground">
                              {rs(r.latestPrice)} now, about {rs(f.q50)}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>How Mila has done</CardTitle>
              <CardDescription>Hold-out test, Jan 2024 to Nov 2026</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Inside the 80% range</dt>
                  <dd className="tabular text-xl font-semibold">{pct(card.overall.coverage80, 1)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Spikes caught</dt>
                  <dd className="tabular text-xl font-semibold">{pct(card.overall.spike_recall)}</dd>
                </div>
              </dl>
              <Link href="/app/track-record" className="mt-3 inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
                Full track record <ChevronRight className="size-4" aria-hidden />
              </Link>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>When Mila updates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              <p>
                Mila checks for the Central Bank&apos;s Daily Price Report every 30 minutes from 3 pm to 9 pm Sri Lanka
                time on trading days, then refreshes rainfall and the 7-day outlook.
              </p>
              <p>
                Your digest: <span className="text-foreground">by email</span> every Monday and Thursday evening, with
                your basket&apos;s warnings and next week&apos;s cost. SMS is in pilot with a few eateries.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
