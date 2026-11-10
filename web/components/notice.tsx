import { cn } from "@/lib/utils";

export function Notice({
  children,
  tone = "info",
  className,
}: {
  children: React.ReactNode;
  tone?: "info" | "warn";
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-xl border px-4 py-3 text-sm leading-relaxed",
        tone === "info" && "bg-brand-soft/60 border-brand/20 text-foreground",
        tone === "warn" && "bg-rise-soft border-rise/30 text-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DemoBanner() {
  return (
    <Notice tone="warn" className="font-medium">
      DEMO MODE — the forecasts on this page are fake numbers from a local fixture, used only to build the
      screens. Prices are real.
    </Notice>
  );
}
