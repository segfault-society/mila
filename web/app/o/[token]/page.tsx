import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Freshness } from "@/components/freshness";
import { DemoBanner, Notice } from "@/components/notice";
import { ItemCard } from "@/components/item-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBoard, getHealth, getSubscriber } from "@/lib/data";
import { day, qty, rs, rsRange, signedPct } from "@/lib/format";
import { viewLabel, viewQuery } from "@/lib/markets";
import { signalRank } from "@/lib/signals";
import { cn } from "@/lib/utils";
import type { BoardRow } from "@/lib/types";

export const dynamic = "force-dynamic";

// private link: keep it out of search engines
export const metadata: Metadata = {
  title: "Your kitchen",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Line = {
  row: BoardRow;
  qty: number;
  today: number;
  mid: number;
  lo: number;
  hi: number;
  forecasted: boolean;
};

export default async function OwnerPage(props: PageProps<"/o/[token]">) {
  const { token } = await props.params;
  const sub = await getSubscriber(token);
  if (!sub) notFound();

  const [board, health] = await Promise.all([getBoard(sub.market, sub.priceType), getHealth()]);
  const { run, marketLatest } = board;
  const hasRun = run != null;
  const label = viewLabel(sub.market, sub.priceType);
  const q = viewQuery({ market: sub.market, type: sub.priceType });

  const byKey = new Map(board.rows.map((r) => [r.key, r]));
  const mine = Object.keys(sub.basket)
    .map((k) => byKey.get(k))
    .filter((r): r is BoardRow => r != null);
  const unknown = Object.keys(sub.basket).filter((k) => !byKey.has(k));

  const lines: Line[] = mine
    .filter((r) => r.latestPrice != null)
    .map((r) => {
      const amount = sub.basket[r.key];
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

  const sorted = [...mine].sort((a, b) => {
    if (hasRun) {
      const d = signalRank(a.forecast?.signal ?? "no_forecast") - signalRank(b.forecast?.signal ?? "no_forecast");
      if (d) return d;
    }
    return (sub.basket[b.key] * (b.latestPrice ?? 0)) - (sub.basket[a.key] * (a.latestPrice ?? 0));
  });

  return (
    <>
      <SiteHeader homeHref={`/${q}`} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-10">
        <section className="space-y-3">
          <div>
            <p className="text-sm text-muted-foreground">Your kitchen</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{sub.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your basket, priced at <span className="font-medium text-foreground">{label}</span>.
            </p>
          </div>
          <Freshness health={health} run={run} />
          {run?.demo && <DemoBanner />}
        </section>

        <Card className="mt-5">
          <CardHeader>
            <CardTitle className="text-lg">Rice-packet cost</CardTitle>
            <CardDescription>What one day of your basket costs at {label} prices</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-muted/60 p-4">
                <p className="text-xs text-muted-foreground">Today{marketLatest ? ` (prices of ${day(marketLatest)})` : ""}</p>
                <p className="tabular mt-1 text-3xl font-semibold tracking-tight">{rs(total.today)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">per day</p>
              </div>
              <div
                className={cn(
                  "rounded-xl p-4",
                  !hasRun || change == null
                    ? "bg-muted/60"
                    : change >= 0.1
                      ? "bg-spike-soft"
                      : change >= 0.03
                        ? "bg-rise-soft"
                        : change <= -0.03
                          ? "bg-fall-soft"
                          : "bg-steady-soft",
                )}
              >
                <p className="text-xs text-muted-foreground">Next week{target ? ` (by ${day(target)})` : ""}</p>
                {hasRun && lines.some((l) => l.forecasted) ? (
                  <>
                    <p className="tabular mt-1 text-3xl font-semibold tracking-tight">
                      about {rs(total.mid)}
                      {change != null && (
                        <span
                          className={cn(
                            "ml-2 align-middle text-base font-medium",
                            change >= 0.03 ? "text-spike" : change <= -0.03 ? "text-fall" : "text-muted-foreground",
                          )}
                        >
                          {signedPct(change)}
                        </span>
                      )}
                    </p>
                    <p className="tabular mt-0.5 text-xs text-muted-foreground">
                      likely {rsRange(total.lo, total.hi)} per day
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Forecasts not yet available — today&apos;s prices shown.
                  </p>
                )}
              </div>
            </div>
            {hasRun && flatCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {flatCount} item{flatCount === 1 ? "" : "s"} without a forecast this week{" "}
                {flatCount === 1 ? "is" : "are"} counted at today&apos;s price.
              </p>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Per day</TableHead>
                  <TableHead className="text-right">Today</TableHead>
                  {hasRun && <TableHead className="text-right">Next week</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.row.key}>
                    <TableCell className="font-medium whitespace-normal">
                      {l.row.name}
                      <span className="tabular block text-xs font-normal text-muted-foreground sm:hidden">
                        {qty(l.qty, l.row.unit)} a day
                      </span>
                    </TableCell>
                    <TableCell className="tabular hidden text-right text-muted-foreground sm:table-cell">
                      {qty(l.qty, l.row.unit)}
                    </TableCell>
                    <TableCell className="tabular text-right">{rs(l.today)}</TableCell>
                    {hasRun && (
                      <TableCell
                        className={cn(
                          "tabular text-right",
                          !l.forecasted && "text-muted-foreground",
                          l.forecasted && l.mid > l.today * 1.03 && "text-spike",
                          l.forecasted && l.mid < l.today * 0.97 && "text-fall",
                        )}
                      >
                        {rs(l.mid)}
                        {!l.forecasted && <span className="sr-only"> (no forecast, today&apos;s price)</span>}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="sm:hidden">Total per day</TableCell>
                  <TableCell colSpan={2} className="hidden sm:table-cell">
                    Total per day
                  </TableCell>
                  <TableCell className="tabular text-right">{rs(total.today)}</TableCell>
                  {hasRun && <TableCell className="tabular text-right">{rs(total.mid)}</TableCell>}
                </TableRow>
              </TableFooter>
            </Table>
            {(noPrice.length > 0 || unknown.length > 0) && (
              <p className="text-xs text-muted-foreground">
                Not counted (no price at {label}): {[...noPrice.map((r) => r.name), ...unknown].join(", ")}.
              </p>
            )}
          </CardContent>
        </Card>

        {!hasRun && (
          <Notice className="mt-5">
            <span className="font-medium">Forecasts not yet available — latest prices shown.</span>
          </Notice>
        )}

        <h2 className="mt-8 mb-3 text-sm font-medium text-muted-foreground">Your items, next 7 days</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted
            .filter((r) => r.latestPrice != null)
            .map((r) => (
              <ItemCard
                key={r.key}
                row={r}
                href={`/item/${r.key}${q}`}
                hasRun={hasRun}
                marketLatest={marketLatest}
                extra={
                  <p className="-mt-1 text-xs text-muted-foreground">
                    You use {qty(sub.basket[r.key], r.unit)} a day
                  </p>
                }
              />
            ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
