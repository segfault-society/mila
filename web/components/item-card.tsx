import Link from "next/link";
import { cn } from "@/lib/utils";
import { day, daysBetween, num, pct, perUnit, rs, rsRange, sentenceCase, signedPct } from "@/lib/format";
import { SIGNAL_META, SPIKE_WARN_AT } from "@/lib/signals";
import type { BoardRow } from "@/lib/types";
import { PendingBadge, SignalBadge } from "@/components/signal-badge";
import { Sparkline } from "@/components/sparkline";

const SPARK_STROKE: Record<string, string> = {
  spike: "var(--spike)",
  rise: "var(--rise)",
  steady: "var(--steady)",
  fall: "var(--fall)",
  no_forecast: "var(--muted-foreground)",
};

export function weekChange(row: Pick<BoardRow, "latestPrice" | "weekAgoPrice">): number | null {
  if (row.latestPrice == null || row.weekAgoPrice == null || row.weekAgoPrice <= 0) return null;
  return row.latestPrice / row.weekAgoPrice - 1;
}

export function ItemCard({
  row,
  href,
  hasRun,
  marketLatest,
  extra,
}: {
  row: BoardRow;
  href: string;
  hasRun: boolean;
  marketLatest: string | null;
  extra?: React.ReactNode;
}) {
  const f = row.forecast;
  const signal = f?.signal ?? "no_forecast";
  const change = weekChange(row);
  const stale = row.latestDate && marketLatest ? daysBetween(row.latestDate, marketLatest) > 3 : false;
  const showRange = f && f.signal !== "no_forecast" && f.q50 != null;

  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 transition-shadow hover:shadow-md hover:ring-foreground/20",
        signal === "spike" && hasRun && "ring-2 ring-spike/35",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold leading-tight">{row.name}</h3>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-sm">
            <span className="tabular text-lg font-semibold tracking-tight">{rs(row.latestPrice)}</span>
            <span className="text-muted-foreground">{perUnit(row.unit)}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className={cn(stale && "text-rise font-medium")}>{day(row.latestDate)}</span>
            {change != null && (
              <>
                {", "}
                <span
                  className={cn(
                    "tabular",
                    change >= 0.1 && "text-spike font-medium",
                    change <= -0.1 && "text-fall font-medium",
                  )}
                >
                  {signedPct(change)}
                </span>{" "}
                vs a week before
              </>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {hasRun ? <SignalBadge signal={signal} prob={f?.spikeProb} /> : <PendingBadge />}
          <Sparkline
            points={row.spark}
            stroke={hasRun ? SPARK_STROKE[signal] : "var(--muted-foreground)"}
            className="opacity-90"
            width={96}
            height={28}
          />
        </div>
      </div>

      {hasRun && (
        <div className="border-t pt-3 text-sm">
          {showRange ? (
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">By {day(f.targetDate)}</p>
                <p className="tabular">
                  <span className="font-semibold">about {rs(f.q50)}</span>{" "}
                  {f.q10 != null && f.q90 != null && num(Math.min(f.q10, f.q50!)) !== num(Math.max(f.q90, f.q50!)) && (
                    <span className="text-muted-foreground">
                      ({rsRange(Math.min(f.q10, f.q50!), Math.max(f.q90, f.q50!))})
                    </span>
                  )}
                </p>
              </div>
              {f.spikeProb != null && (
                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted-foreground">Spike chance</p>
                  <p
                    className={cn(
                      "tabular font-semibold",
                      f.spikeProb >= SPIKE_WARN_AT ? "text-spike" : f.spikeProb >= 0.08 ? "text-rise" : "",
                    )}
                  >
                    {pct(f.spikeProb)}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Mila stays silent: </span>
              {f?.abstainReason
                ? sentenceCase(f.abstainReason)
                : f
                  ? "No reason recorded"
                  : "No forecast for this item in this market yet"}
              .
            </p>
          )}
        </div>
      )}

      {extra}

      <span className="sr-only">
        {hasRun
          ? signal === "spike" && f?.spikeProb != null
            ? `${SIGNAL_META[signal].label}, ${pct(f.spikeProb)} chance`
            : SIGNAL_META[signal].label
          : "Forecast pending"}. Open {row.name} details.
      </span>
    </Link>
  );
}
