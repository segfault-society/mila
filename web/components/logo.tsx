import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Mila's mark: a curry leaf whose midrib is a price line that dips, then jumps.
 * The line is knocked out of the leaf (a mask), so it works on any background.
 * The turmeric dot is where the price lands after the jump.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-7 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <mask id={`mila-cut-${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
          <rect width="32" height="32" fill="#fff" />
          <path
            d="M8.6 23.4 13.4 18.6 16.6 21.2 22.6 12"
            fill="none"
            stroke="#000"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </mask>
      </defs>
      <path
        d="M5 27C4.4 15.6 12.2 5.6 25.6 4.4c.9 12.6-8 21.6-20.6 22.6Z"
        fill="var(--logo-leaf, var(--brand))"
        mask={`url(#mila-cut-${id})`}
      />
      <path d="M2.8 29.2 6.4 25.6" stroke="var(--logo-leaf, var(--brand))" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="26.4" cy="4.2" r="3" fill="var(--logo-accent, var(--turmeric))" />
    </svg>
  );
}

/** Mark plus the lowercase "mila" wordmark. */
export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={markClassName} />
      <span className="text-[19px] leading-none font-semibold tracking-[-0.03em]">mila</span>
    </span>
  );
}
