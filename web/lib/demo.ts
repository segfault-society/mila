import "server-only";
import { addDays } from "@/lib/format";
import type { Signal } from "@/lib/signals";
import type { Forecast, Run } from "@/lib/types";

/**
 * Local, in-memory FAKE forecasts for building the UI before the model lands.
 * Only active with MILA_DEMO=1 outside Vercel production, and only while the real
 * forecast_runs table is empty. Nothing here is ever written to the database.
 */
export function demoEnabled(): boolean {
  return process.env.MILA_DEMO === "1" && process.env.VERCEL_ENV !== "production";
}

export function demoRun(dataDate: string): Run {
  return {
    id: -1,
    createdAt: new Date().toISOString(),
    dataDate,
    modelVersion: "demo-fixture (fake)",
    horizonDays: 7,
    demo: true,
  };
}

const PLAN: Record<string, Signal> = {
  beans: "spike",
  carrot: "spike",
  tomato: "rise",
  green_chilli: "rise",
  cabbage: "rise",
  pumpkin: "fall",
  brinjal: "fall",
  lime: "no_forecast",
  red_onion_local: "no_forecast",
};

const SHAPE: Record<Exclude<Signal, "no_forecast">, [number, number, number, number]> = {
  // q10, q50, q90 multipliers on the base price, spike probability
  spike: [1.04, 1.27, 1.62, 0.61],
  rise: [0.97, 1.09, 1.27, 0.18],
  steady: [0.93, 1.0, 1.09, 0.04],
  fall: [0.78, 0.89, 0.99, 0.02],
};

const DRIVERS: Record<Signal, string[]> = {
  spike: [
    "5 days of heavy rain in Nuwara Eliya (+180% vs normal)",
    "Pettah wholesale already up 19% this week",
    "Prices this time of year have jumped before (Nov 2023, Nov 2024)",
  ],
  rise: ["Rain in growing areas 40% above normal this week", "Dambulla wholesale up 8% since Monday"],
  steady: ["Rain near normal in growing areas", "Prices flat for two weeks"],
  fall: ["Harvest arrivals rising at Dambulla", "Price still 30% above its 3-month average"],
  no_forecast: [],
};

const REASONS: Record<string, string> = {
  lime: "range too wide to act on this week",
  red_onion_local: "no recent price from CBSL",
};

const round = (x: number) => Math.round(x / 5) * 5 || Math.round(x * 100) / 100;

export function demoForecast(
  itemKey: string,
  market: string,
  priceType: string,
  baseDate: string,
  basePrice: number,
): Forecast {
  const signal: Signal = PLAN[itemKey] ?? "steady";
  const targetDate = addDays(baseDate, 7);
  if (signal === "no_forecast") {
    return {
      itemKey,
      market,
      priceType,
      baseDate,
      basePrice,
      targetDate,
      q10: null,
      q50: null,
      q90: null,
      spikeProb: null,
      signal,
      abstainReason: REASONS[itemKey] ?? "not enough recent history",
      drivers: [],
    };
  }
  const [a, b, c, p] = SHAPE[signal];
  return {
    itemKey,
    market,
    priceType,
    baseDate,
    basePrice,
    targetDate,
    q10: round(basePrice * a),
    q50: round(basePrice * b),
    q90: round(basePrice * c),
    spikeProb: p,
    signal,
    abstainReason: null,
    drivers: DRIVERS[signal],
  };
}

export function demoBacktest(itemKey: string): Record<string, number> | null {
  if (!PLAN[itemKey] && itemKey !== "nadu") return null;
  return { coverage80: 0.81, spike_precision: 0.58, spike_recall: 0.44, mae_pct: 0.083 };
}

export const DEMO_TOKEN = "demo";

export const DEMO_SUBSCRIBER = {
  id: -1,
  name: "Demo Eatery (fake)",
  market: "pettah",
  priceType: "wholesale",
  basket: {
    nadu: 12,
    beans: 2.5,
    carrot: 1,
    pumpkin: 2,
    big_onion_local: 1.5,
    green_chilli: 0.3,
    tomato: 1,
    red_dhal: 1.5,
    coconut: 10,
  } as Record<string, number>,
};
