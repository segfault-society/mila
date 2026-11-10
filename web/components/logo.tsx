import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Mila's mark, drawn as an app-icon tile: a lowercase "m" whose last leg climbs into a sharp price spike,
 * with a turmeric dot over the peak. It reads as "m" + spike, as "mi" (the dot over the peak), and as a hill
 * with the sun over it: the up-country growing areas whose rain moves the price.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn("size-8 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={`mila-tile-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a9d8f" />
          <stop offset="1" stopColor="#0d4f4a" />
        </linearGradient>
        <linearGradient id={`mila-sheen-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#mila-tile-${id})`} />
      <rect
        x="0.5"
        y="0.5"
        width="39"
        height="39"
        rx="10.5"
        fill={`url(#mila-sheen-${id})`}
        stroke="#fff"
        strokeOpacity="0.12"
      />
      <path
        d="M7.5 29.5V19a3 3 0 0 1 6 0V29.5M13.5 19a3 3 0 0 1 6 0V24.5L25.5 12.5L31.5 22"
        fill="none"
        stroke="#fff"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="25.5" cy="7.6" r="2.6" fill="#f2b33d" />
    </svg>
  );
}

/** Mark plus the "mila" wordmark. */
export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <span className="text-[21px] leading-none font-bold tracking-[-0.045em]">mila</span>
    </span>
  );
}
