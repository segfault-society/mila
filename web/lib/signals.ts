export type Signal = "spike" | "rise" | "steady" | "fall" | "no_forecast";

export const SIGNAL_ORDER: Signal[] = ["spike", "rise", "steady", "fall", "no_forecast"];

export const SIGNAL_META: Record<
  Signal,
  { glyph: string; label: string; plural: string; tone: string; dot: string; ring: string }
> = {
  spike: {
    glyph: "▲",
    label: "Spike risk",
    plural: "Spike risk",
    tone: "bg-spike-soft text-spike",
    dot: "bg-spike",
    ring: "ring-spike/40",
  },
  rise: {
    glyph: "▲",
    label: "Mild rise",
    plural: "Mild rise",
    tone: "bg-rise-soft text-rise",
    dot: "bg-rise",
    ring: "ring-rise/40",
  },
  steady: {
    glyph: "●",
    label: "Steady",
    plural: "Steady",
    tone: "bg-steady-soft text-steady",
    dot: "bg-steady",
    ring: "ring-steady/30",
  },
  fall: {
    glyph: "▼",
    label: "Falling",
    plural: "Falling",
    tone: "bg-fall-soft text-fall",
    dot: "bg-fall",
    ring: "ring-fall/30",
  },
  no_forecast: {
    glyph: "?",
    label: "No forecast",
    plural: "No forecast",
    tone: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/60",
    ring: "ring-foreground/10",
  },
};

export function signalRank(s: Signal): number {
  return SIGNAL_ORDER.indexOf(s);
}

/** Spike = a rise of 25% or more within 7 days (the model's definition). */
/** Mila warns when the spike chance is at least 15%: the threshold with the best F1 on validation. */
export const SPIKE_WARN_AT = 0.15;
export const SPIKE_THRESHOLD = 0.25;
export const HORIZON_DAYS = 7;
