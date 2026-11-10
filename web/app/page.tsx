import type { Metadata } from "next";
import Link from "next/link";
import { CloudRain, FileSpreadsheet, MessageSquareText, ReceiptText, ShoppingBasket, TriangleAlert } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SignalBadge } from "@/components/signal-badge";
import { CostTiles } from "@/components/kitchen-view";
import { DEFAULT_BASKET, priceBasket } from "@/lib/basket";
import { getBoard, getScorecard } from "@/lib/data";
import { day, pct, perUnit, rs, rsRange, signedPct } from "@/lib/format";
import { DEFAULT_VIEW } from "@/lib/markets";
import { SIGNAL_META, signalRank, type Signal } from "@/lib/signals";
import type { BoardRow } from "@/lib/types";
import { cn } from "@/lib/utils";

export const revalidate = 300;
export const metadata: Metadata = {
  title: { absolute: "Mila: vegetable price warnings for Sri Lankan eateries, a week ahead" },
};

const AREAS = ["Nuwara Eliya", "Welimada", "Bandarawela", "Dambulla", "Kekirawa", "Sigiriya", "Jaffna", "Kalpitiya"];
const NAIVE_F1 = 0.15;

const SIGNALS: { signal: Signal; text: string }[] = [
  { signal: "spike", text: "At least a 15% chance the price jumps 25% or more within 7 days. The badge shows the chance." },
  { signal: "rise", text: "Mila's middle guess is 5% or more above today's price, without a real spike risk." },
  { signal: "steady", text: "The middle guess is within 5% of today's price." },
  { signal: "fall", text: "The middle guess is 5% or more below today's price." },
  { signal: "no_forecast", text: "Data is stale, conditions are unlike anything in the history, or the range is too wide to act on." },
];

const btnPrimary =
  "inline-flex h-11 items-center justify-center rounded-lg bg-foreground px-5 text-[15px] font-medium text-background shadow-sm transition-colors hover:bg-foreground/85";
const btnSecondary =
  "inline-flex h-11 items-center justify-center rounded-lg border bg-background px-5 text-[15px] font-medium shadow-xs transition-colors hover:bg-muted";

function byOutlook(rows: BoardRow[]): BoardRow[] {
  return [...rows].sort(
    (a, b) =>
      signalRank(a.forecast?.signal ?? "no_forecast") - signalRank(b.forecast?.signal ?? "no_forecast") ||
      (b.forecast?.spikeProb ?? 0) - (a.forecast?.spikeProb ?? 0) ||
      a.name.localeCompare(b.name),
  );
}

function SectionHead({ title, children, center }: { title: string; children?: React.ReactNode; center?: boolean }) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {children && <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground text-pretty">{children}</p>}
    </div>
  );
}

export default async function Home() {
  const [board, card] = await Promise.all([getBoard(DEFAULT_VIEW.market, DEFAULT_VIEW.type), getScorecard()]);
  const hasRun = board.run != null;
  const basketRows = board.rows.filter((r) => r.basket && r.latestPrice != null);
  const sorted = byOutlook(basketRows);
  const watch = sorted.filter((r) => r.forecast?.signal === "spike" || r.forecast?.signal === "rise");
  const priced = priceBasket(board.rows, DEFAULT_BASKET);
  const o = card.overall;
  const f1 =
    o.spike_precision != null && o.spike_recall != null
      ? (2 * o.spike_precision * o.spike_recall) / (o.spike_precision + o.spike_recall)
      : null;
  const target = watch[0]?.forecast?.targetDate ?? priced.target;
  const smsItems = watch.filter((r) => r.forecast?.signal === "spike").slice(0, 2);

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_60%_at_75%_10%,color-mix(in_oklch,var(--brand)_13%,transparent),transparent),radial-gradient(40%_40%_at_10%_0%,color-mix(in_oklch,var(--turmeric)_10%,transparent),transparent)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:48px_48px] opacity-40 [mask-image:radial-gradient(70%_60%_at_60%_0%,#000,transparent)]"
          />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20 lg:pb-24">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-sm text-muted-foreground backdrop-blur">
                <span aria-hidden className="size-1.5 rounded-full bg-steady" />
                Free pilot for rice-and-curry eateries
              </p>
              <h1 className="mt-5 text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-[56px]">
                Know next week&apos;s vegetable bill before you pay it
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
                Mila reads the Central Bank&apos;s daily market prices and the rain in the growing areas, then tells your
                kitchen which vegetables are about to jump in price, a week ahead, and what your basket will cost.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/sign-up" className={btnPrimary}>
                  Get started free
                </Link>
                <Link href="/#live" className={btnSecondary}>
                  See this week&apos;s warnings
                </Link>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">Sign up with Google or email. No card, no fees.</p>
            </div>

            {/* live product preview */}
            <div className="relative">
              <div className="rounded-2xl border bg-card/90 p-1.5 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.25)] backdrop-blur">
                <div className="rounded-xl border bg-background">
                  <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">Demo kitchen, 150 rice packets a day</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {DEFAULT_VIEW.label}
                        {board.marketLatest ? `, prices to ${day(board.marketLatest)}` : ""}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-steady-soft px-2 py-0.5 text-xs font-medium text-steady">
                      <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-steady" />
                      Live
                    </span>
                  </div>
                  <div className="space-y-4 p-4">
                    <CostTiles priced={priced} hasRun={hasRun} marketLatest={board.marketLatest} compact />
                    <div>
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Watch this week</p>
                      {watch.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {hasRun ? "No warnings at Pettah wholesale this week." : "Forecasts not yet available."}
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {watch.slice(0, 3).map((r) => (
                            <li key={r.key} className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5">
                              <span className="min-w-0">
                                <span className="block text-sm font-medium">{r.name}</span>
                                <span className="line-clamp-1 text-xs text-muted-foreground">
                                  {r.forecast?.drivers[0] ?? `about ${rs(r.forecast?.q50)} ${perUnit(r.unit)} by ${day(r.forecast?.targetDate)}`}
                                </span>
                              </span>
                              <SignalBadge signal={r.forecast!.signal} prob={r.forecast!.spikeProb} size="sm" />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Real numbers from today&apos;s forecast for a typical 150-packet kitchen.
              </p>
            </div>
          </div>
        </section>

        {/* numbers */}
        <section aria-label="The data behind Mila" className="border-y bg-muted/30">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-4 sm:px-6 lg:grid-cols-4">
            {[
              { v: "2,461", l: "CBSL Daily Price Reports read, back to 1 Aug 2016" },
              { v: "265,927", l: "validated prices across 2,329 trading days" },
              { v: "8 areas", l: "of rainfall history since 1991, where the vegetables grow" },
              { v: "30 min", l: "between checks, 3 pm to 9 pm on trading days" },
            ].map((s) => (
              <div key={s.v} className="py-8 pr-4">
                <dt className="sr-only">{s.l}</dt>
                <dd className="tabular text-3xl font-semibold tracking-tight">{s.v}</dd>
                <dd className="mt-1 text-sm leading-snug text-muted-foreground">{s.l}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* how it works */}
        <section id="how" className="scroll-mt-20 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHead title="How it works">
              Prices at Pettah and Dambulla often jump after heavy rain in the hills. Mila watches for that pattern every
              trading day, so you hear about it before the market does.
            </SectionHead>
            <ol className="mt-12 grid gap-4 md:grid-cols-3">
              {[
                {
                  icon: ShoppingBasket,
                  title: "Tell Mila what you buy",
                  text: "Pick your items, how much you use a day, and where you buy: Pettah, Dambulla or Narahenpita, wholesale or retail. It takes about two minutes.",
                },
                {
                  icon: CloudRain,
                  title: "Mila reads prices and rain",
                  text: `Each trading day Mila reads the Central Bank's Daily Price Report and the rainfall in ${AREAS.slice(0, 3).join(", ")} and five more growing areas.`,
                },
                {
                  icon: ReceiptText,
                  title: "You see next week's bill",
                  text: "The likely cost of your basket in 7 days, with a range, and which items could jump 25% or more, with the reason in plain words.",
                },
              ].map((s, i) => (
                <li key={s.title} className="relative rounded-2xl border bg-card p-6">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
                      <s.icon className="size-5" aria-hidden />
                    </span>
                    <span className="text-sm font-medium text-muted-foreground">Step {i + 1}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{s.text}</p>
                </li>
              ))}
            </ol>

            <div className="mt-14 grid gap-10 rounded-2xl border bg-muted/30 p-6 sm:p-8 lg:grid-cols-[1fr_1.4fr]">
              <div>
                <h3 className="text-xl font-semibold tracking-tight">What the labels mean</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                  A spike is a rise of 25% or more within 7 days. Mila warns from a 15% chance, because in testing that
                  setting caught the most spikes for the fewest false alarms. When Mila isn&apos;t sure, it says so
                  instead of guessing.
                </p>
                <Link href="/about" className="mt-4 inline-block text-sm font-medium underline-offset-4 hover:underline">
                  Read the full method
                </Link>
              </div>
              <ul className="space-y-3">
                {SIGNALS.map((s) => (
                  <li key={s.signal} className="grid grid-cols-[112px_1fr] items-start gap-3 text-[15px] leading-snug">
                    <SignalBadge signal={s.signal} size="sm" className="justify-self-start" label={SIGNAL_META[s.signal].label} />
                    <span className="text-muted-foreground">{s.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* what owners get */}
        <section id="owners" className="scroll-mt-20 border-t bg-muted/20 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHead title="Built around the owner's morning">
              No charts to study. Mila answers two questions: what will my basket cost next week, and what should I buy
              early?
            </SectionHead>
            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              <article className="flex flex-col rounded-2xl border bg-card p-6">
                <ReceiptText className="size-5 text-brand" aria-hidden />
                <h3 className="mt-4 text-lg font-semibold tracking-tight">Your kitchen cost</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                  One day of your own basket priced today and next week, with the 80% range, so you can set the
                  rice-packet price with your eyes open.
                </p>
                <div className="mt-6 rounded-xl border bg-background p-4">
                  <p className="text-xs text-muted-foreground">Demo kitchen, next week</p>
                  <p className="tabular mt-1 text-2xl font-semibold tracking-tight">
                    {priced.anyForecast ? `about ${rs(priced.total.mid)}` : rs(priced.total.today)}
                    {priced.anyForecast && priced.change != null && (
                      <span className={cn("ml-2 text-sm font-medium", priced.change >= 0.03 ? "text-spike" : "text-muted-foreground")}>
                        {signedPct(priced.change)}
                      </span>
                    )}
                  </p>
                  <p className="tabular text-xs text-muted-foreground">
                    {priced.anyForecast ? `likely ${rsRange(priced.total.lo, priced.total.hi)} a day` : "a day at today's prices"}
                  </p>
                </div>
              </article>

              <article className="flex flex-col rounded-2xl border bg-card p-6">
                <TriangleAlert className="size-5 text-spike" aria-hidden />
                <h3 className="mt-4 text-lg font-semibold tracking-tight">Spike warnings with reasons</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                  Only for the items you buy, with the chance and the reason: rain in the hills, a run-up at Pettah, the
                  time of year.
                </p>
                <div className="mt-6 space-y-2">
                  {(watch.length ? watch.slice(0, 2) : sorted.slice(0, 2)).map((r) => (
                    <div key={r.key} className="rounded-xl border bg-background p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{r.name}</span>
                        {r.forecast && <SignalBadge signal={r.forecast.signal} prob={r.forecast.spikeProb} size="sm" />}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {r.forecast?.drivers[0] ?? "Reasons appear with each forecast."}
                      </p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="flex flex-col rounded-2xl border bg-card p-6">
                <div className="flex items-center justify-between">
                  <MessageSquareText className="size-5 text-brand" aria-hidden />
                  <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Email live, SMS in pilot</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold tracking-tight">The week&apos;s warnings, sent to you</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                  Every Monday and Thursday evening, your basket&apos;s warnings arrive by email. A short SMS version, for
                  owners who don&apos;t open apps, is being tried with a few eateries first.
                </p>
                <div className="mt-6 rounded-xl border bg-background p-4">
                  <p className="text-xs text-muted-foreground">Example message from today&apos;s forecast</p>
                  <p className="mt-2 max-w-[90%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm leading-relaxed">
                    {smsItems.length
                      ? `Mila: ${smsItems.map((r) => r.name.toLowerCase()).join(" and ")} at Pettah could jump 25%+ by ${day(target)}. Buy early if you can.`
                      : "Mila: no spike warnings at Pettah this week. Your basket should cost about the same."}
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* accuracy */}
        <section id="accuracy" className="scroll-mt-20 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHead title="Tested on prices it never saw">
              From January 2024 to November 2026 Mila made more than 88,000 forecasts using only the data it would have
              had on each morning, then each one was checked against what the Central Bank reported a week later.
            </SectionHead>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  v: pct(o.coverage80, 1),
                  l: "of real prices landed inside Mila's 80% range",
                  n: "The range is meant to hold 8 times in 10, and it did.",
                },
                {
                  v: pct(o.spike_recall),
                  l: "of real spikes were warned about a week ahead",
                  n: "A spike is a rise of 25% or more within 7 days.",
                },
                {
                  v: f1 != null ? f1.toFixed(2) : "—",
                  l: "spike score (F1), against 0.15 for the it-rose-last-week rule",
                  n: `About ${pct(o.spike_precision)} of warnings come true. Mila leans towards warning early.`,
                },
                {
                  v: o.mase != null ? o.mase.toFixed(2) : "—",
                  l: "error relative to guessing no change (MASE)",
                  n: "Below 1 means Mila's middle guess beats assuming prices stay put.",
                },
              ].map((s) => (
                <div key={s.l} className="rounded-2xl border bg-card p-6">
                  <p className="tabular text-4xl font-semibold tracking-tight">{s.v}</p>
                  <p className="mt-2 text-[15px] leading-snug font-medium">{s.l}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.n}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Numbers read live from Mila&apos;s scorecard (F1 baseline {NAIVE_F1.toFixed(2)} from the same back-test).
              Forecasts published since 10 Nov 2026 are scored as their 7-day targets arrive.{" "}
              <Link href="/app/track-record" className="font-medium text-foreground underline-offset-4 hover:underline">
                See the item-by-item record
              </Link>
            </p>
          </div>
        </section>

        {/* live prices */}
        <section id="live" className="scroll-mt-20 border-t bg-muted/20 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <SectionHead title={`This week at ${DEFAULT_VIEW.label}`}>
                The eatery basket from the latest Central Bank report
                {board.marketLatest ? ` (${day(board.marketLatest)})` : ""}, with Mila&apos;s outlook
                {target ? ` to ${day(target)}` : ""}.
              </SectionHead>
              <Link href="/app/prices" className={btnSecondary}>
                Open the full price board
              </Link>
            </div>
            <div className="mt-10 overflow-hidden rounded-2xl border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Item</th>
                    <th className="px-4 py-3 text-right font-medium">Today</th>
                    <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">Next week, likely</th>
                    <th className="px-4 py-3 text-right font-medium">Outlook</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sorted.map((r) => {
                    const f = r.forecast;
                    const ok = f && f.signal !== "no_forecast" && f.q50 != null;
                    return (
                      <tr key={r.key}>
                        <td className="px-4 py-3 font-medium">{r.name}</td>
                        <td className="tabular px-4 py-3 text-right">
                          {rs(r.latestPrice)}
                          <span className="text-muted-foreground"> {perUnit(r.unit)}</span>
                        </td>
                        <td className="tabular hidden px-4 py-3 text-right text-muted-foreground sm:table-cell">
                          {ok ? rsRange(Math.min(f.q10 ?? f.q50!, f.q50!), Math.max(f.q90 ?? f.q50!, f.q50!)) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <SignalBadge signal={f?.signal ?? "no_forecast"} prob={f?.spikeProb} size="sm" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Wholesale prices in rupees. Dambulla, Narahenpita and retail prices are on the full board after you sign in.
            </p>
          </div>
        </section>

        {/* data sources */}
        <section id="data" className="scroll-mt-20 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHead title="Where the numbers come from">
              Every number on Mila comes from public data and a statistical model. No chatbot writes the forecasts or the
              reasons.
            </SectionHead>
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              <a
                href="https://www.cbsl.gov.lk/en/statistics/economic-indicators/price-report"
                className="group rounded-2xl border bg-card p-6 transition-colors hover:border-foreground/25"
              >
                <FileSpreadsheet className="size-5 text-brand" aria-hidden />
                <h3 className="mt-4 text-lg font-semibold tracking-tight">Central Bank of Sri Lanka Daily Price Report</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                  Wholesale and retail prices at Pettah, Dambulla, Narahenpita and Marandagahamula, every trading day
                  since 1 Aug 2016. Every price Mila shows is traced to the report it came from.
                </p>
                <p className="mt-4 text-sm font-medium underline-offset-4 group-hover:underline">cbsl.gov.lk</p>
              </a>
              <a href="https://open-meteo.com/" className="group rounded-2xl border bg-card p-6 transition-colors hover:border-foreground/25">
                <CloudRain className="size-5 text-brand" aria-hidden />
                <h3 className="mt-4 text-lg font-semibold tracking-tight">Open-Meteo weather (CC BY 4.0)</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                  Daily rainfall since 1991 for {AREAS.slice(0, -1).join(", ")} and {AREAS[AREAS.length - 1]}. Heavy rain
                  in the hills is one of the main reasons vegetable prices jump.
                </p>
                <p className="mt-4 text-sm font-medium underline-offset-4 group-hover:underline">open-meteo.com</p>
              </a>
            </div>
          </div>
        </section>

        {/* final call to action */}
        <section className="px-4 pb-20 sm:px-6 sm:pb-28">
          <div className="mx-auto max-w-6xl rounded-3xl border bg-[color-mix(in_oklch,var(--brand)_7%,var(--card))] px-6 py-14 sm:px-12 sm:py-16">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Plan next week&apos;s menu with fewer surprises
              </h2>
              <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">
                Set up your kitchen once. Mila prices it every trading day and tells you what to buy early.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/sign-up"
                  className="inline-flex h-11 items-center justify-center rounded-lg bg-foreground px-5 text-[15px] font-medium text-background transition-colors hover:bg-foreground/85"
                >
                  Create a free account
                </Link>
                <Link
                  href="/sign-in"
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-background px-5 text-[15px] font-medium transition-colors hover:bg-muted"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
