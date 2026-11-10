import { cn } from "@/lib/utils";
import { SIGNAL_META, type Signal } from "@/lib/signals";

export function SignalBadge({
  signal,
  size = "md",
  className,
  label,
}: {
  signal: Signal;
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}) {
  const m = SIGNAL_META[signal];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium whitespace-nowrap",
        size === "sm" && "h-6 px-2 text-xs",
        size === "md" && "h-7 px-2.5 text-[13px]",
        size === "lg" && "h-8 px-3 text-sm",
        m.tone,
        className,
      )}
    >
      <span aria-hidden className="text-[0.8em] leading-none">
        {m.glyph}
      </span>
      {label ?? m.label}
    </span>
  );
}

export function PendingBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-dashed px-2.5 text-[13px] text-muted-foreground",
        className,
      )}
    >
      Forecast pending
    </span>
  );
}
