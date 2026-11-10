import type { Metadata } from "next";
import Link from "next/link";
import { ChefHat, PiggyBank } from "lucide-react";
import { Freshness } from "@/components/freshness";
import { changeTone } from "@/components/kitchen-view";
import { DemoBanner, Notice } from "@/components/notice";
import { SignalBadge } from "@/components/signal-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getBoard, getHealth, getKitchenForUser } from "@/lib/data";
import { day, dayLong, perUnit, pct, qty, rs, signedPct } from "@/lib/format";
import { viewLabel, viewQuery } from "@/lib/markets";
import { buildPlan, getPacketsPerDay, perPacket, type BuyAhead, type Outlook, type Plan, type Swap } from "@/lib/planner";
import { cn } from "@/lib/utils";
import { PacketsForm } from "./packets-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Menu planner" };

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Per-packet amounts are small, so always show cents: "Rs 90.93", "Rs 83.83–107.38". */
const cents = new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rsc = (v: number) => `Rs ${cents.format(v)}`;
/** Daily amounts in whole rupees: "Rs 1,278", "Rs 19". */
const whole = new Intl.NumberFormat("en-LK", { maximumFractionDigits: 0 });
const rsw = (v: number) => `Rs ${whole.format(Math.round(v))}`;
const rscRange = (lo: number, hi: number) => `Rs ${cents.format(Math.min(lo, hi))}–${cents.format(Math.max(lo, hi))}`;

/** "Rs 1,250 now, about Rs 1,310 by 17 Nov (+5%)" for one item, per unit. */
function priceLine(o: Outlook, target: string | null) {
  return (
    <>
      {rs(o.today)}
      {perUnit(o.row.unit)} now, about {rs(o.mid)}
      {perUnit(o.row.unit)}
      {target ? ` by ${day(target)}` : ""} ({signedPct(o.change)})
    </>
  );
}

export default async function PlannerPage() {
  const user = await requireUser();
  const kitchen = await getKitchenForUser(user.id);

  if (!kitchen) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
        <Card className="bg-brand-soft/50 ring-brand/20">
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-background text-brand ring-1 ring-brand/20">
              <ChefHat className="size-5" aria-hidden />
            </span>
            <div className="flex-1">
              <p className="font-medium">Set up your kitchen first</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                The menu planner works from the items you buy and how much a day. Add them once and Mila will suggest
                swaps and tell you which storables are worth buying now.
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
      </main>
    );
  }

  const [board, health, packets] = await Promise.all([
    getBoard(kitchen.market, kitchen.priceType),
    getHealth(),
    getPacketsPerDay(user.id),
  ]);
  const label = viewLabel(kitchen.market, kitchen.priceType);
  const q = viewQuery({ market: kitchen.market, type: kitchen.priceType });
  const itemHref = (k: string) => `/app/items/${k}${q}`;
  const hasRun = board.run != null;
  const plan = buildPlan(board, kitchen.basket);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
      <section className="mb-5 space-y-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Menu planner</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Next week for {kitchen.name}, priced at <span className="font-medium text-foreground">{label}</span>.
          </p>
        </div>
        <Freshness health={health} run={board.run} />
        {board.run?.demo && <DemoBanner />}
      </section>

      {!hasRun ? (
        <Notice>
          <span className="font-medium">Forecasts not yet available.</span> The planner needs next week&apos;s forecast;
          it appears here once the day&apos;s forecast is published.
        </Notice>
      ) : (
        <>
          <Headline plan={plan} />
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="grid content-start gap-4">
              <SwapsCard swaps={plan.swaps} target={plan.targetDate} label={label} itemHref={itemHref} />
              <BuyAheadCard plan={plan} itemHref={itemHref} />
            </div>
            <div className="grid content-start gap-4">
              <PacketCard plan={plan} packets={packets} />
              <Card size="sm">
                <CardHeader>
                  <CardTitle>How the planner works</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    Next week&apos;s prices are Mila&apos;s middle estimate for {day(plan.targetDate)}; the range is
                    where the price lands 8 times in 10.
                  </p>
                  <p>
                    Swaps only compare items that play the same role (curry vegetables, onions, potatoes, rice), at{" "}
                    {label}, and only items Mila has a forecast for.
                  </p>
                  <p>Buy-ahead advice is only for items that keep for a week: onions, potatoes, rice, dhal, dried chilli, sugar and coconut oil.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function Headline({ plan }: { plan: Plan }) {
  const { swapsPerDay, buyAheadWeek, perDay } = plan.saving;
  const swapCount = plan.swaps.filter((s) => (s.options[0]?.saving ?? 0) >= 1).length;
  const buyCount = plan.buyAhead.filter((b) => b.kind === "buy_now").length;
  const parts: string[] = [];
  if (swapsPerDay >= 1) {
    parts.push(`Swapping ${swapCount} item${swapCount === 1 ? "" : "s"} about to rise: up to ${rsw(swapsPerDay)} a day`);
  }
  if (buyAheadWeek >= 1) {
    parts.push(
      `buying a week of ${buyCount} storable${buyCount === 1 ? "" : "s"} now: about ${rsw(buyAheadWeek)} in all (${rsw(buyAheadWeek / 7)} a day)`,
    );
  }
  const anyRising = plan.swaps.length > 0;

  return (
    <Card className="bg-brand-soft/50 ring-brand/20">
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-background text-brand ring-1 ring-brand/20">
          <PiggyBank className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          {perDay >= 1 ? (
            <>
              <p className="text-sm text-muted-foreground">You could save next week</p>
              <p className="tabular mt-0.5 text-3xl font-semibold tracking-tight">about {rsw(perDay)} a day</p>
              {parts.length > 0 && (
                <p className="tabular mt-1 text-sm text-muted-foreground">
                  {parts.join("; ").replace(/^b/, "B")}.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-lg font-semibold tracking-tight">No savings to act on this week</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {anyRising
                  ? "Some items are rising, but the steadier options would not cost less a day at your amounts. They are listed below if you still want to switch."
                  : "Nothing in your basket is expected to rise enough to swap or buy ahead. Buy as usual."}
              </p>
            </>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Forecast for {dayLong(plan.targetDate)}, from prices of {day(plan.dataDate)}.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function SwapsCard({
  swaps,
  target,
  label,
  itemHref,
}: {
  swaps: Swap[];
  target: string | null;
  label: string;
  itemHref: (key: string) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Swaps to consider this week</CardTitle>
        <CardDescription>
          These are options to consider, not equal swaps: the dish, taste and cooking change. Each compares your daily
          amount of the item at next week&apos;s middle estimate.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {swaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing in your basket is expected to rise this week, so there is nothing to swap.
          </p>
        ) : (
          <ul className="space-y-3">
            {swaps.map((s) => (
              <li key={s.from.row.key} className="rounded-xl border p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={itemHref(s.from.row.key)} className="font-medium underline-offset-4 hover:underline">
                      {s.from.row.name}
                    </Link>
                    <p className="tabular mt-0.5 text-xs text-muted-foreground">
                      You use {qty(s.qty, s.from.row.unit)} a day. {priceLine(s.from, target)}
                    </p>
                  </div>
                  <SignalBadge signal={s.from.signal} prob={s.from.spikeProb} size="sm" />
                </div>
                {s.options.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No steadier {s.role} at {label} this week. Keep an eye on the price.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y overflow-hidden rounded-lg bg-muted/50">
                    {s.options.map((o) => (
                      <li key={o.sub.row.key} className="space-y-2 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                            <span>
                              Use{" "}
                              <Link href={itemHref(o.sub.row.key)} className="font-medium underline-offset-4 hover:underline">
                                {lower(o.sub.row.name)}
                              </Link>{" "}
                              instead
                            </span>
                            <SignalBadge signal={o.sub.signal} prob={o.sub.spikeProb} size="sm" />
                            {o.inBasket && <span className="text-xs text-muted-foreground">already in your basket</span>}
                          </p>
                          <p
                            className={cn(
                              "tabular text-sm font-semibold",
                              o.saving >= 0.5 ? "text-steady" : "text-muted-foreground",
                            )}
                          >
                            {o.saving >= 0.5
                              ? `${rsw(o.saving)} less a day`
                              : o.saving <= -0.5
                                ? `${rsw(-o.saving)} more a day`
                                : "About the same a day"}
                          </p>
                        </div>
                        <dl className="tabular grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                          <div>
                            <dt className="text-muted-foreground">
                              {qty(s.qty, s.from.row.unit)} of {lower(s.from.row.name)}
                            </dt>
                            <dd>
                              about {rsw(o.fromCost)} a day{" "}
                              <span className="text-muted-foreground">({signedPct(s.from.change)} expected)</span>
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              {qty(s.qty, o.sub.row.unit)} of {lower(o.sub.row.name)}
                            </dt>
                            <dd>
                              about {rsw(o.subCost)} a day{" "}
                              <span className="text-muted-foreground">({signedPct(o.sub.change)} expected)</span>
                            </dd>
                          </div>
                        </dl>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function BuyAheadRow({ b, target, itemHref }: { b: BuyAhead; target: string | null; itemHref: (key: string) => string }) {
  const { o } = b;
  const weekQty = qty(Math.round(b.qty * 7 * 100) / 100, o.row.unit);
  return (
    <li className="space-y-1 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={itemHref(o.row.key)} className="font-medium underline-offset-4 hover:underline">
          {o.row.name}
        </Link>
        <SignalBadge signal={o.signal} prob={o.spikeProb} size="sm" />
      </div>
      <p className="text-sm">
        {b.kind === "buy_now" ? (
          <>
            Buying a week&apos;s stock now instead of next week saves about{" "}
            <span className="tabular font-semibold text-steady">{rsw(b.saving)}</span>.
          </>
        ) : b.kind === "ease" ? (
          "Prices are expected to ease; buy as needed."
        ) : (
          <>
            Mila flags {o.signal === "spike" && o.spikeProb != null ? `a ${pct(o.spikeProb)} spike risk` : "a rise"}, but
            the middle estimate is no higher than today&apos;s price, so buying ahead has no clear saving.
          </>
        )}
      </p>
      <p className="tabular text-xs text-muted-foreground">
        {b.kind === "buy_now" ? `${weekQty} for the week. ` : `You use ${qty(b.qty, o.row.unit)} a day. `}
        {priceLine(o, target)}
      </p>
    </li>
  );
}

function BuyAheadCard({ plan, itemHref }: { plan: Plan; itemHref: (key: string) => string }) {
  const { buyAhead, storablesChecked, storablesNoForecast, targetDate } = plan;
  const none = storablesChecked.length === 0 && storablesNoForecast.length === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Buy ahead or wait</CardTitle>
        <CardDescription>For the items you buy that keep for a week or more.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {none ? (
          <p className="text-sm text-muted-foreground">
            Your basket has no items that keep, such as onions, potatoes, rice or dhal.
          </p>
        ) : buyAhead.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None of them is expected to rise or fall this week. Buy them as usual.
          </p>
        ) : (
          <ul className="divide-y">
            {buyAhead.map((b) => (
              <BuyAheadRow key={b.o.row.key} b={b} target={targetDate} itemHref={itemHref} />
            ))}
          </ul>
        )}
        {!none && (
          <p className="text-xs text-muted-foreground">
            {storablesChecked.length > 0 && <>Checked: {storablesChecked.map((r) => r.name).join(", ")}. </>}
            {storablesNoForecast.length > 0 && (
              <>No forecast this week: {storablesNoForecast.map((r) => r.name).join(", ")}.</>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PacketCard({ plan, packets }: { plan: Plan; packets: number | null }) {
  const { priced } = plan;
  const pp = packets ? perPacket(priced, packets) : null;
  const forecasted = priced.anyForecast;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Cost per packet</CardTitle>
        <CardDescription>Your daily basket cost over the rice packets you sell</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pp && packets ? (
          <>
            <dl className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-muted/60 p-3">
                <dt className="text-xs text-muted-foreground">Today</dt>
                <dd className="tabular mt-0.5 text-xl font-semibold tracking-tight">{rsc(pp.today)}</dd>
                <dd className="text-xs text-muted-foreground">a packet</dd>
              </div>
              <div className={cn("rounded-xl p-3", changeTone(priced.change, true))}>
                <dt className="text-xs text-muted-foreground">Next week, about</dt>
                {forecasted ? (
                  <>
                    <dd className="tabular mt-0.5 text-xl font-semibold tracking-tight">{rsc(pp.mid)}</dd>
                    <dd className="tabular text-xs text-muted-foreground">likely {rscRange(pp.lo, pp.hi)}</dd>
                  </>
                ) : (
                  <dd className="mt-1 text-xs text-muted-foreground">No forecast for your items yet</dd>
                )}
              </div>
            </dl>
            {forecasted && (
              <p className="tabular text-sm">
                {Math.abs(pp.change) < 0.005 ? (
                  "About the same per packet next week."
                ) : (
                  <>
                    <span className={cn("font-semibold", pp.change > 0 ? "text-spike" : "text-fall")}>
                      {rsc(Math.abs(pp.change))} {pp.change > 0 ? "more" : "less"}
                    </span>{" "}
                    a packet next week ({signedPct(priced.change)}).
                  </>
                )}
              </p>
            )}
            <p className="tabular text-xs text-muted-foreground">
              {rsw(priced.total.today)} a day today over {packets.toLocaleString("en-LK")} packets. Counts only your
              basket items, not fish, meat, gas or wages.
              {priced.flatCount > 0 &&
                ` ${priced.flatCount} item${priced.flatCount === 1 ? "" : "s"} without a forecast ${priced.flatCount === 1 ? "is" : "are"} counted at today's price.`}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Add how many rice packets you sell a day to see what your basket costs per packet, today and next week.
          </p>
        )}
        <PacketsForm packets={packets} />
      </CardContent>
    </Card>
  );
}
