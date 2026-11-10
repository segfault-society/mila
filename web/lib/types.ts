import type { Signal } from "@/lib/signals";

export type Item = {
  key: string;
  name: string;
  category: string;
  unit: string;
  region: string | null;
  basket: boolean;
};

export type Run = {
  id: number;
  createdAt: string;
  dataDate: string;
  modelVersion: string;
  horizonDays: number;
  demo: boolean;
};

export type Forecast = {
  itemKey: string;
  market: string;
  priceType: string;
  baseDate: string;
  basePrice: number;
  targetDate: string;
  q10: number | null;
  q50: number | null;
  q90: number | null;
  spikeProb: number | null;
  signal: Signal;
  abstainReason: string | null;
  drivers: string[];
};

export type Point = { d: string; p: number };

export type BoardRow = Item & {
  latestDate: string | null;
  latestPrice: number | null;
  weekAgoPrice: number | null;
  spark: Point[];
  forecast: Forecast | null;
};

export type Health = {
  source: string;
  lastSuccessAt: string | null;
  lastDataDate: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
};

export type Subscriber = {
  id: number;
  name: string;
  market: string;
  priceType: string;
  basket: Record<string, number>;
};
