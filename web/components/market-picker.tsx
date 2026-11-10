import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChipScroller } from "@/components/chip-scroller";
import { MARKET_VIEWS, type MarketView, viewQuery } from "@/lib/markets";

/** Plain links (no JS) so it works on any phone; the active one is highlighted. */
export function MarketPicker({
  current,
  basePath = "/",
  available,
}: {
  current: MarketView;
  basePath?: string;
  /** keys "market|type" that have data for this page; others are hidden */
  available?: Set<string>;
}) {
  const views = available
    ? MARKET_VIEWS.filter((v) => available.has(`${v.market}|${v.type}`))
    : MARKET_VIEWS;
  return (
    <ChipScroller label="Market and price type">
      <ul className="flex w-max gap-1.5">
        {views.map((v) => {
          const active = v.market === current.market && v.type === current.type;
          return (
            <li key={`${v.market}|${v.type}`}>
              <Link
                href={`${basePath}${viewQuery(v)}`}
                aria-current={active ? "page" : undefined}
                scroll={false}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                {v.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </ChipScroller>
  );
}
