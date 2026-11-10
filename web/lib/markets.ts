export type PriceType = "wholesale" | "retail";

export type MarketView = {
  market: string;
  type: PriceType;
  label: string;
  short: string;
  note?: string;
};

/** The market / price-type series CBSL reports today. Narahenpita wholesale only appears in 2020. */
export const MARKET_VIEWS: MarketView[] = [
  { market: "pettah", type: "wholesale", label: "Pettah wholesale", short: "Pettah · wholesale" },
  { market: "pettah", type: "retail", label: "Pettah retail", short: "Pettah · retail" },
  { market: "dambulla", type: "wholesale", label: "Dambulla wholesale", short: "Dambulla · wholesale" },
  { market: "dambulla", type: "retail", label: "Dambulla retail", short: "Dambulla · retail" },
  { market: "narahenpita", type: "retail", label: "Narahenpita retail", short: "Narahenpita · retail" },
  {
    market: "marandagahamula",
    type: "wholesale",
    label: "Marandagahamula wholesale",
    short: "Marandagahamula · rice",
    note: "rice only",
  },
];

export const DEFAULT_VIEW = MARKET_VIEWS[0];

const MARKET_NAMES: Record<string, string> = {
  pettah: "Pettah",
  dambulla: "Dambulla",
  narahenpita: "Narahenpita",
  marandagahamula: "Marandagahamula",
};

export function marketName(market: string): string {
  return MARKET_NAMES[market] ?? market.charAt(0).toUpperCase() + market.slice(1);
}

export function viewLabel(market: string, type: string): string {
  return `${marketName(market)} ${type}`;
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Resolve ?m=&t= to a known series, falling back to Pettah wholesale. */
export function resolveView(sp: SearchParams): MarketView {
  const m = first(sp.m)?.toLowerCase();
  const t = first(sp.t)?.toLowerCase();
  return (
    MARKET_VIEWS.find((v) => v.market === m && v.type === t) ??
    MARKET_VIEWS.find((v) => v.market === m) ??
    DEFAULT_VIEW
  );
}

export function viewQuery(v: { market: string; type: string }): string {
  return `?m=${encodeURIComponent(v.market)}&t=${encodeURIComponent(v.type)}`;
}
