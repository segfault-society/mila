import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getItems, getLiveScores, getScorecard, type LiveScores } from "@/lib/data";
import { dayYear, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Track record" };

/** "It rose last week, so warn" scored 0.15 F1 on the same hold-out (pipeline back-test). */
const NAIVE_F1 = 0.15;

const COLS = [
  { key: "name", label: "Item", numeric: false },
  { key: "n_forecasts", label: "Forecasts", numeric: true },
  { key: "coverage80", label: "Inside 80% range", numeric: true },
  { key: "mae_pct", label: "Typical miss", numeric: true },
  { key: "n_spikes", label: "Real spikes", numeric: true },
  { key: "spike_recall", label: "Spikes caught", numeric: true },
  { key: "spike_precision", label: "Warnings right", numeric: true },
] as const;
type SortKey = (typeof COLS)[number]["key"];

const int = new Intl.NumberFormat("en-LK");

function f1(p?: number, r?: number): number | null {
  if (p == null || r == null || p + r === 0) return null;
  return (2 * p * r) / (p + r);
}

function Stat({ value, label, note }: { value: string; label: string; note: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="tabular mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{note}</p>
    </div>
  );
}

function LiveBlock({ live }: { live: LiveScores | null }) {
  const has = live != null && live.n > 0;
  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span aria-hidden className={cn("size-2 rounded-full", has ? "bg-steady" : "bg-muted-foreground/50")} />
          Live since 10 Nov 2026
        </CardTitle>
        <CardDescription>
          Every forecast Mila has published since the pilot went live, checked against the real CBSL price on its target
          date.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {has ? (
          <dl className="grid gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Forecasts scored</dt>
              <dd className="tabular text-xl font-semibold">{int.format(live.n)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Inside the 80% range</dt>
              <dd className="tabular text-xl font-semibold">{pct(live.inside80, 1)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Mean error</dt>
              <dd className="tabular text-xl font-semibold">{pct(live.meanAbsPctError, 1)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Spikes called</dt>
              <dd className="tabular text-xl font-semibold">
                {live.spikesCaught} of {live.spikes}
              </dd>
              <dd className="text-xs text-muted-foreground">
                {live.warnedRight} of {live.warned} warnings came true
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Nothing to score yet. Each forecast looks 7 days ahead, so live scoring starts once the first forecasts reach
            their target dates, from 17 Nov 2026. This block then fills in automatically every trading day.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default async function TrackRecordPage(props: PageProps<"/app/track-record">) {
  const sp = await props.searchParams;
  const sortParam = (Array.isArray(sp.sort) ? sp.sort[0] : sp.sort) as SortKey | undefined;
  const sort: SortKey = COLS.some((c) => c.key === sortParam) ? sortParam! : "n_spikes";
  const dir = (Array.isArray(sp.dir) ? sp.dir[0] : sp.dir) === "asc" ? "asc" : "desc";

  const [card, items, live] = await Promise.all([getScorecard(), getItems(), getLiveScores()]);
  const names = new Map(items.map((i) => [i.key, i.name]));
  const o = card.overall;
  const modelF1 = f1(o.spike_precision, o.spike_recall);

  const rows = card.items
    .map((i) => ({ ...i, name: names.get(i.key) ?? i.key }))
    .sort((a, b) => {
      const mul = dir === "asc" ? 1 : -1;
      if (sort === "name") return mul * a.name.localeCompare(b.name);
      const va = a.metrics[sort];
      const vb = b.metrics[sort];
      if (va == null && vb == null) return a.name.localeCompare(b.name);
      if (va == null) return 1;
      if (vb == null) return -1;
      return mul * (va - vb) || a.name.localeCompare(b.name);
    });
  const totalSpikes = card.items.reduce((s, i) => s + (i.metrics.n_spikes ?? 0), 0);

  const href = (key: SortKey) => {
    const nextDir = sort === key ? (dir === "desc" ? "asc" : "desc") : key === "name" ? "asc" : "desc";
    return `/app/track-record?sort=${key}&dir=${nextDir}`;
  };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
      <div className="max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight">Mila&apos;s track record</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Before going live, Mila was tested on prices it had never seen: every trading day from January 2024 to
          November 2026 it made a 7-day forecast using only the data available that morning, and each forecast was
          checked against what CBSL reported a week later.
        </p>
      </div>

      {Object.keys(o).length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">The back-test has not been scored yet.</p>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Real price inside the 80% range"
            value={pct(o.coverage80, 1)}
            note="Mila's range is meant to hold the real price 8 times in 10. It did."
          />
          <Stat
            label="Real spikes Mila warned about"
            value={pct(o.spike_recall)}
            note={`A spike is a rise of 25% or more within 7 days. ${int.format(totalSpikes)} happened in the hold-out.`}
          />
          <Stat
            label="Spike warnings that came true"
            value={pct(o.spike_precision)}
            note={
              <>
                Mila warns from a 15% chance, so many warnings are near misses. Balance (F1):{" "}
                <span className="tabular font-medium text-foreground">{modelF1?.toFixed(2) ?? "—"}</span> vs{" "}
                <span className="tabular">{NAIVE_F1.toFixed(2)}</span> for &ldquo;it rose last week&rdquo;.
              </>
            }
          />
          <Stat
            label="Error vs a no-change guess"
            value={o.mase != null ? o.mase.toFixed(2) : "—"}
            note="Below 1 means Mila's middle guess misses by less than assuming next week's price equals today's (MASE)."
          />
        </div>
      )}

      <LiveBlock live={live} />

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">By item</CardTitle>
          <CardDescription>
            Hold-out back-test, January 2024 to November 2026
            {card.scoredAt ? `, scored ${dayYear(card.scoredAt.slice(0, 10))}` : ""}. Select a column to sort.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-4">
          <Table>
            <TableHeader>
              <TableRow>
                {COLS.map((c) => {
                  const active = sort === c.key;
                  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
                  return (
                    <TableHead
                      key={c.key}
                      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                      className={cn(c.numeric && "text-right", c.key === "n_forecasts" && "hidden md:table-cell", c.key === "spike_precision" && "hidden sm:table-cell", c.key === "mae_pct" && "hidden sm:table-cell")}
                    >
                      <Link
                        href={href(c.key)}
                        scroll={false}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-foreground",
                          active ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {c.label}
                        <Icon className="size-3.5 opacity-70" aria-hidden />
                      </Link>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const m = r.metrics;
                return (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium whitespace-normal">
                      <Link href={`/app/items/${r.key}`} className="underline-offset-2 hover:underline">
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular hidden text-right text-muted-foreground md:table-cell">
                      {m.n_forecasts != null ? int.format(m.n_forecasts) : "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "tabular text-right",
                        m.coverage80 != null && Math.abs(m.coverage80 - 0.8) > 0.07 && "text-rise",
                      )}
                    >
                      {pct(m.coverage80)}
                    </TableCell>
                    <TableCell className="tabular hidden text-right sm:table-cell">
                      {m.mae_pct != null ? `±${m.mae_pct.toFixed(m.mae_pct < 10 ? 1 : 0)}%` : "—"}
                    </TableCell>
                    <TableCell className="tabular text-right text-muted-foreground">
                      {m.n_spikes != null ? int.format(m.n_spikes) : "—"}
                    </TableCell>
                    <TableCell className="tabular text-right">{m.n_spikes ? pct(m.spike_recall) : "—"}</TableCell>
                    <TableCell className="tabular hidden text-right sm:table-cell">
                      {m.spike_precision != null ? pct(m.spike_precision) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>All items</TableCell>
                <TableCell className="tabular hidden text-right md:table-cell">{int.format(card.nForecasts)}</TableCell>
                <TableCell className="tabular text-right">{pct(o.coverage80, 1)}</TableCell>
                <TableCell className="hidden sm:table-cell" />
                <TableCell className="tabular text-right">{int.format(totalSpikes)}</TableCell>
                <TableCell className="tabular text-right">{pct(o.spike_recall)}</TableCell>
                <TableCell className="tabular hidden text-right sm:table-cell">{pct(o.spike_precision)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <p className="mt-3 px-4 text-xs leading-relaxed text-muted-foreground sm:px-0">
            Typical miss is the average gap between Mila&apos;s middle guess and the real price, as a share of the price.
            Ranges marked amber held the real price noticeably more or less than 8 times in 10. Items with no real
            spikes in the hold-out show a dash.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
