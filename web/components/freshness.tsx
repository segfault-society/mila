import { cn } from "@/lib/utils";
import { day, daysBetween, stamp, todayColombo } from "@/lib/format";
import type { Health, Run } from "@/lib/types";

type Tone = "ok" | "warn" | "off";

function Pill({ label, value, tone, title }: { label: string; value: string; tone: Tone; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-2.5 text-xs whitespace-nowrap"
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          tone === "ok" && "bg-steady",
          tone === "warn" && "bg-rise",
          tone === "off" && "bg-muted-foreground/50",
        )}
      />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}

function failedSinceSuccess(h: Health | undefined): boolean {
  if (!h?.lastErrorAt) return false;
  return !h.lastSuccessAt || Date.parse(h.lastErrorAt) > Date.parse(h.lastSuccessAt);
}

export function Freshness({ health, run }: { health: Health[]; run: Run | null }) {
  const today = todayColombo();
  const cbsl = health.find((h) => h.source === "cbsl_prices");
  const meteo = health.find((h) => h.source === "open_meteo");

  const priceAge = cbsl?.lastDataDate ? daysBetween(cbsl.lastDataDate, today) : null;
  const priceTone: Tone = !cbsl?.lastDataDate
    ? "off"
    : failedSinceSuccess(cbsl) || (priceAge ?? 0) > 4
      ? "warn"
      : "ok";

  const rainTone: Tone = failedSinceSuccess(meteo) ? "warn" : !meteo?.lastSuccessAt ? "off" : "ok";
  const rainValue = meteo?.lastSuccessAt
    ? `updated ${stamp(meteo.lastSuccessAt)}`
    : meteo?.lastErrorAt
      ? "retrying"
      : "not connected yet";

  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Data freshness">
      <Pill
        label="Prices"
        value={cbsl?.lastDataDate ? `CBSL ${day(cbsl.lastDataDate)}` : "waiting"}
        tone={priceTone}
        title={
          failedSinceSuccess(cbsl)
            ? `Last CBSL fetch failed ${stamp(cbsl?.lastErrorAt)}; showing the last good report.`
            : cbsl?.lastSuccessAt
              ? `Checked ${stamp(cbsl.lastSuccessAt)} (Sri Lanka time)`
              : undefined
        }
      />
      <Pill
        label="Rain"
        value={rainValue}
        tone={rainTone}
        title={
          failedSinceSuccess(meteo)
            ? `Last weather fetch failed ${stamp(meteo?.lastErrorAt)} (Sri Lanka time)`
            : undefined
        }
      />
      <Pill
        label="Forecast"
        value={run ? (run.demo ? "DEMO (fake)" : `run ${stamp(run.createdAt)}`) : "not yet available"}
        tone={run ? (run.demo ? "warn" : "ok") : "off"}
        title={run && !run.demo ? `Model ${run.modelVersion}, prices up to ${day(run.dataDate)}` : undefined}
      />
    </div>
  );
}
