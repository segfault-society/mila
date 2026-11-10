"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { day, dayLong, dayToMs, num, rs, rsRange } from "@/lib/format";
import type { Signal } from "@/lib/signals";
import type { Point } from "@/lib/types";

export type FanForecast = {
  baseDate: string;
  basePrice: number;
  targetDate: string;
  q10: number;
  q50: number;
  q90: number;
  signal: Signal;
};

type Datum = {
  t: number;
  price?: number;
  band?: [number, number];
  median?: number;
  kind: "history" | "base" | "target";
};

const SIGNAL_COLOR: Record<Signal, string> = {
  spike: "var(--spike)",
  rise: "var(--rise)",
  steady: "var(--steady)",
  fall: "var(--fall)",
  no_forecast: "var(--muted-foreground)",
};

const DAY = 86_400_000;

function buildData(history: Point[], f: FanForecast | null): Datum[] {
  const data: Datum[] = history.map((h) => ({ t: dayToMs(h.d), price: h.p, kind: "history" }));
  if (!f) return data;
  const baseT = dayToMs(f.baseDate);
  const existing = data.find((d) => d.t === baseT);
  if (existing) {
    existing.band = [f.basePrice, f.basePrice];
    existing.median = f.basePrice;
    existing.kind = "base";
  } else {
    data.push({ t: baseT, band: [f.basePrice, f.basePrice], median: f.basePrice, kind: "base" });
  }
  data.push({ t: dayToMs(f.targetDate), band: [f.q10, f.q90], median: f.q50, kind: "target" });
  return data.sort((a, b) => a.t - b.t);
}

/** Round axis bounds to a friendly step (…, 10, 20, 25, 50, 100, …) and list the ticks. */
function niceAxis(lo: number, hi: number, count = 4): { domain: [number, number]; ticks: number[] } {
  const raw = Math.max((hi - lo) / count, 0.01);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? 10 * mag;
  const a = Math.max(0, Math.floor(lo / step) * step);
  const b = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = a; v <= b + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { domain: [a, b], ticks };
}

function ticksFor(min: number, max: number): number[] {
  const out: number[] = [];
  const span = max - min;
  const step = span > 50 * DAY ? 14 * DAY : 7 * DAY;
  for (let t = max; t >= min + 3 * DAY; t -= step) out.unshift(t);
  return out;
}

function TooltipBody({ active, payload }: { active?: boolean; payload?: { payload: Datum }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const date = dayLong(new Date(d.t).toISOString().slice(0, 10));
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{date}</p>
      {d.kind === "target" && d.band ? (
        <>
          <p className="mt-1">
            Mila&apos;s middle guess: <span className="tabular font-semibold">{rs(d.median)}</span>
          </p>
          <p className="text-muted-foreground">8 in 10 chance: {rsRange(d.band[0], d.band[1])}</p>
        </>
      ) : (
        <p className="mt-1">
          Price: <span className="tabular font-semibold">{rs(d.price ?? d.median)}</span>
        </p>
      )}
    </div>
  );
}

export function FanChart({
  history,
  forecast,
  today,
  height = 280,
}: {
  history: Point[];
  forecast: FanForecast | null;
  today: string;
  height?: number;
}) {
  const data = buildData(history, forecast);
  if (data.length === 0) {
    return (
      <div className="grid place-items-center text-sm text-muted-foreground" style={{ height }}>
        No prices in the last 8 weeks for this market.
      </div>
    );
  }
  const todayT = dayToMs(today);
  const minT = data[0].t;
  const maxT = Math.max(data[data.length - 1].t, todayT);
  const color = forecast ? SIGNAL_COLOR[forecast.signal] : "var(--muted-foreground)";
  const values = data.flatMap((d) => [d.price, d.median, ...(d.band ?? [])]).filter((v): v is number => v != null);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.06 || hi * 0.1;
  const y = niceAxis(lo - pad, hi + pad);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[minT, maxT + DAY / 2]}
            ticks={ticksFor(minT, forecast ? dayToMs(forecast.targetDate) : maxT)}
            tickFormatter={(t: number) => day(new Date(t).toISOString().slice(0, 10))}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={16}
            padding={{ left: 6, right: 18 }}
          />
          <YAxis
            domain={y.domain}
            ticks={y.ticks}
            tickFormatter={(v: number) => num(v)}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip content={<TooltipBody />} cursor={{ stroke: "var(--border)" }} />
          <Area
            dataKey="band"
            type="linear"
            stroke="none"
            fill={color}
            fillOpacity={0.2}
            connectNulls
            isAnimationActive={false}
            activeDot={false}
          />
          <Line
            dataKey="median"
            type="linear"
            stroke={color}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            dataKey="price"
            type="linear"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          <ReferenceLine
            x={todayT}
            stroke="var(--muted-foreground)"
            strokeDasharray="2 3"
            label={{ value: "today", position: "insideTopRight", fontSize: 11, fill: "var(--muted-foreground)" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
