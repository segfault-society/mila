import Link from "next/link";
import { ChevronRight, ClipboardList } from "lucide-react";
import { ItemCard } from "@/components/item-card";
import { Notice } from "@/components/notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { priceBasket, type PricedBasket } from "@/lib/basket";
import { day, qty, rs, rsRange, signedPct } from "@/lib/format";
import { signalRank } from "@/lib/signals";
import { cn } from "@/lib/utils";
import type { BoardRow, Subscriber } from "@/lib/types";

type Board = { rows: BoardRow[]; run: { demo: boolean } | null; marketLatest: string | null };

export function changeTone(change: number | null, hasRun: boolean): string {
  if (!hasRun || change == null) return "bg-muted/60";
  if (change >= 0.1) return "bg-spike-soft";
  if (change >= 0.03) return "bg-rise-soft";
  if (change <= -0.03) return "bg-fall-soft";
  return "bg-steady-soft";
}

/** Today vs next week for one day of a basket: the two big numbers. */
export function CostTiles({
  priced,
  hasRun,
  marketLatest,
  compact = false,
}: {
  priced: PricedBasket;
  hasRun: boolean;
  marketLatest: string | null;
  compact?: boolean;
}) {
  const { total, change, target } = priced;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-muted/60 p-4">
        <p className="text-xs text-muted-foreground">Today{marketLatest ? ` (prices of ${day(marketLatest)})` : ""}</p>
        <p className={cn("tabular mt-1 font-semibold tracking-tight", compact ? "text-2xl" : "text-3xl")}>
          {rs(total.today)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">per day</p>
      </div>
      <div className={cn("rounded-xl p-4", changeTone(change, hasRun))}>
        <p className="text-xs text-muted-foreground">Next week{target ? ` (by ${day(target)})` : ""}</p>
        {hasRun && priced.anyForecast ? (
          <>
            <p className={cn("tabular mt-1 font-semibold tracking-tight", compact ? "text-2xl" : "text-3xl")}>
              {compact ? "" : "about "}
              {rs(total.mid)}
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
            <p className="tabular mt-0.5 text-xs text-muted-foreground">likely {rsRange(total.lo, total.hi)} per day</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Forecasts not yet available. Today&apos;s prices shown.</p>
        )}
      </div>
    </div>
  );
}

/** An owner's kitchen: basket cost today vs next week, the per-item table and each item's outlook. */
export function KitchenView({
  sub,
  board,
  label,
  itemHref,
  plannerHref,
}: {
  sub: Subscriber;
  board: Board;
  label: string;
  itemHref: (key: string) => string;
  /** signed-in app only: link to the menu planner (left out on the public /o/[token] page) */
  plannerHref?: string;
}) {
  const { run, marketLatest } = board;
  const hasRun = run != null;
  const priced = priceBasket(board.rows, sub.basket);
  const { lines, noPrice, unknown, total, flatCount, mine } = priced;

  const sorted = [...mine].sort((a, b) => {
    if (hasRun) {
      const d = signalRank(a.forecast?.signal ?? "no_forecast") - signalRank(b.forecast?.signal ?? "no_forecast");
      if (d) return d;
    }
    return sub.basket[b.key] * (b.latestPrice ?? 0) - sub.basket[a.key] * (a.latestPrice ?? 0);
  });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Daily basket cost</CardTitle>
          <CardDescription>What one day of your basket costs at {label} prices</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CostTiles priced={priced} hasRun={hasRun} marketLatest={marketLatest} />
          {hasRun && flatCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {flatCount} item{flatCount === 1 ? "" : "s"} without a forecast this week {flatCount === 1 ? "is" : "are"}{" "}
              counted at today&apos;s price.
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

      {plannerHref && (
        <Link
          href={plannerHref}
          className="mt-5 flex items-center gap-4 rounded-xl bg-brand-soft/50 p-4 ring-1 ring-brand/20 transition hover:ring-brand/40"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-background text-brand ring-1 ring-brand/20">
            <ClipboardList className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Plan next week&apos;s menu</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              Swaps to consider for items about to rise, which storables to buy now, and your cost per packet.
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      )}

      {!hasRun && (
        <Notice className="mt-5">
          <span className="font-medium">Forecasts not yet available. Latest prices shown.</span>
        </Notice>
      )}

      <h2 className="mt-8 mb-3 text-sm font-medium text-muted-foreground">Your items, next 7 days</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sorted
          .filter((r) => r.latestPrice != null)
          .map((r) => (
            <ItemCard
              key={r.key}
              row={r}
              href={itemHref(r.key)}
              hasRun={hasRun}
              marketLatest={marketLatest}
              extra={<p className="-mt-1 text-xs text-muted-foreground">You use {qty(sub.basket[r.key], r.unit)} a day</p>}
            />
          ))}
      </div>
    </>
  );
}
