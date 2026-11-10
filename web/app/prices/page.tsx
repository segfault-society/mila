import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { MarketPicker } from "@/components/market-picker";
import { Freshness } from "@/components/freshness";
import { DemoBanner, Notice } from "@/components/notice";
import { ItemCard, weekChange } from "@/components/item-card";
import { SignalBadge } from "@/components/signal-badge";
import { getBoard, getHealth } from "@/lib/data";
import { day, daysBetween, perUnit, rs } from "@/lib/format";
import { resolveView, viewQuery } from "@/lib/markets";
import { SIGNAL_META, SIGNAL_ORDER, signalRank, type Signal } from "@/lib/signals";
import type { BoardRow } from "@/lib/types";

export const revalidate = 300;

function sortRows(rows: BoardRow[], hasRun: boolean): BoardRow[] {
  return [...rows].sort((a, b) => {
    if (hasRun) {
      const sa = a.forecast?.signal ?? "no_forecast";
      const sb = b.forecast?.signal ?? "no_forecast";
      if (sa !== sb) return signalRank(sa) - signalRank(sb);
      const pa = a.forecast?.spikeProb ?? -1;
      const pb = b.forecast?.spikeProb ?? -1;
      if (pa !== pb) return pb - pa;
    } else {
      // no forecasts yet: biggest movers this week first
      const ca = weekChange(a) ?? -Infinity;
      const cb = weekChange(b) ?? -Infinity;
      if (ca !== cb) return cb - ca;
    }
    return a.name.localeCompare(b.name);
  });
}

export default async function Overview(props: PageProps<"/">) {
  const view = resolveView(await props.searchParams);
  const [board, health] = await Promise.all([getBoard(view.market, view.type), getHealth()]);
  const { run, marketLatest } = board;
  const hasRun = run != null;
  const q = viewQuery(view);

  const basket = board.rows.filter((r) => r.basket);
  const shown = sortRows(
    basket.filter((r) => r.latestPrice != null),
    hasRun,
  );
  const notReported = basket.filter((r) => r.latestPrice == null);
  // other items CBSL still reports here (skip series that stopped, e.g. imported rice last seen in 2025)
  const others = board.rows.filter(
    (r) => !r.basket && r.latestDate != null && marketLatest != null && daysBetween(r.latestDate, marketLatest) <= 30,
  );

  const counts = new Map<Signal, number>();
  for (const r of shown) {
    const sgl = r.forecast?.signal ?? "no_forecast";
    counts.set(sgl, (counts.get(sgl) ?? 0) + 1);
  }
  const groups = hasRun
    ? SIGNAL_ORDER.map((sgl) => ({
        signal: sgl,
        rows: shown.filter((r) => (r.forecast?.signal ?? "no_forecast") === sgl),
      })).filter((g) => g.rows.length)
    : [{ signal: null as Signal | null, rows: shown }];

  return (
    <>
      <SiteHeader homeHref={`/${q}`} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-10">
        <section className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Will your vegetables cost more next week?
            </h1>
            <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              Mila watches Central Bank daily prices and rain in the growing areas, and warns rice-and-curry
              kitchens about price spikes 7 days ahead.
            </p>
          </div>
          <Freshness health={health} run={run} />
          <MarketPicker current={view} />
        </section>

        <section className="mt-6 space-y-3">
          {run?.demo && <DemoBanner />}
          {!hasRun && (
            <Notice>
              <span className="font-medium">Forecasts not yet available — latest prices shown.</span>{" "}
              <span className="text-muted-foreground">
                Items are ordered by how much they moved over the past week.
              </span>
            </Notice>
          )}
          {hasRun && shown.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="mr-1 text-muted-foreground">
                Next 7 days at {view.label}
                {marketLatest ? ` (prices to ${day(marketLatest)})` : ""}:
              </span>
              {SIGNAL_ORDER.filter((sgl) => counts.get(sgl)).map((sgl) => (
                <SignalBadge key={sgl} signal={sgl} size="sm" label={`${counts.get(sgl)} ${SIGNAL_META[sgl].plural.toLowerCase()}`} />
              ))}
            </div>
          )}
        </section>

        {shown.length === 0 ? (
          <Notice className="mt-6">No prices for the eatery basket in {view.label} yet.</Notice>
        ) : (
          groups.map((g) => (
            <section key={g.signal ?? "all"} className="mt-6">
              {g.signal && (
                <h2 className="mb-2.5 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <span aria-hidden className={`size-2 rounded-full ${SIGNAL_META[g.signal].dot}`} />
                  {SIGNAL_META[g.signal].plural} <span className="tabular">({g.rows.length})</span>
                </h2>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.rows.map((r) => (
                  <ItemCard
                    key={r.key}
                    row={r}
                    href={`/item/${r.key}${q}`}
                    hasRun={hasRun}
                    marketLatest={marketLatest}
                  />
                ))}
              </div>
            </section>
          ))
        )}

        {notReported.length > 0 && (
          <p className="mt-6 text-sm text-muted-foreground">
            Not reported at {view.label}: {notReported.map((r) => r.name).join(", ")}.
          </p>
        )}

        {others.length > 0 && (
          <details className="group mt-8 rounded-2xl bg-card ring-1 ring-foreground/10">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium select-none">
              <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
              Other items CBSL reports here ({others.length}) — not in the eatery basket
            </summary>
            <ul className="divide-y border-t text-sm">
              {others.map((r) => (
                <li key={r.key}>
                  <Link
                    href={`/item/${r.key}${q}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/60"
                  >
                    <span>{r.name}</span>
                    <span className="tabular text-right">
                      {rs(r.latestPrice)}
                      <span className="text-muted-foreground"> {perUnit(r.unit)} · {day(r.latestDate)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
