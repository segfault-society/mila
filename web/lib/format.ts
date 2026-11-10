export const TZ = "Asia/Colombo";

const rs0 = new Intl.NumberFormat("en-LK", { maximumFractionDigits: 0 });
const rs2 = new Intl.NumberFormat("en-LK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** "Rs 1,250" — whole rupees, except small unit prices (eggs, limes per unit) keep cents. */
export function rs(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `Rs ${value < 100 ? rs2.format(value) : rs0.format(value)}`;
}

/** Bare number with thousands separators, for ranges ("Rs 500–600"). */
export function num(value: number): string {
  return value < 100 ? rs2.format(value) : rs0.format(value);
}

export function rsRange(lo: number | null, hi: number | null): string {
  if (lo == null || hi == null) return "—";
  const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
  return num(a) === num(b) ? `Rs ${num(a)}` : `Rs ${num(a)}–${num(b)}`;
}

export function pct(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function signedPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const p = Math.round(value * 100);
  return `${p > 0 ? "+" : p < 0 ? "−" : "±"}${Math.abs(p)}%`;
}

/** Parse a SQL `date` ("2026-11-09") as a calendar day — no timezone shift. */
function dayToDate(day: string): Date {
  return new Date(`${day.slice(0, 10)}T00:00:00Z`);
}

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const dayLongFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const dayYearFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const stampFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TZ,
});

/** "9 Nov" */
export function day(d: string | null | undefined): string {
  return d ? dayFmt.format(dayToDate(d)) : "—";
}

/** "Mon, 9 Nov" */
export function dayLong(d: string | null | undefined): string {
  return d ? dayLongFmt.format(dayToDate(d)) : "—";
}

/** "9 Nov 2026" */
export function dayYear(d: string | null | undefined): string {
  return d ? dayYearFmt.format(dayToDate(d)) : "—";
}

/** "10 Nov 06:00" in Sri Lanka time. */
export function stamp(ts: string | null | undefined): string {
  return ts ? stampFmt.format(new Date(ts)) : "—";
}

/** Today's calendar date in Sri Lanka, "YYYY-MM-DD". */
export function todayColombo(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

export function addDays(d: string, n: number): string {
  const x = dayToDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((dayToDate(b).getTime() - dayToDate(a).getTime()) / 86_400_000);
}

export function dayToMs(d: string): number {
  return dayToDate(d).getTime();
}

export function sentenceCase(s: string): string {
  const t = s.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** "2.5 kg", "10 nuts", "6 each" → "6 pcs". */
export function qty(amount: number, unit: string): string {
  const n = Number.isInteger(amount) ? String(amount) : amount.toFixed(amount < 1 ? 2 : 1).replace(/0$/, "");
  if (unit === "nut") return `${n} ${amount === 1 ? "nut" : "nuts"}`;
  if (unit === "each") return `${n} pcs`;
  if (unit === "ltr") return `${n} L`;
  return `${n} ${unit}`;
}

export function perUnit(unit: string): string {
  if (unit === "each") return "each";
  if (unit === "ltr") return "/L";
  return `/${unit}`;
}
