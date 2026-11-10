import Link from "next/link";
import { Logo } from "@/components/logo";

export const ATTRIBUTION =
  "Prices: Central Bank of Sri Lanka Daily Price Report. Weather: Open-Meteo (CC BY 4.0). Forecasts are estimates, not advice.";

/** The attribution line every page carries. */
export function Attribution({ className }: { className?: string }) {
  return (
    <p className={className}>
      Prices:{" "}
      <a href="https://www.cbsl.gov.lk/en/statistics/economic-indicators/price-report" className="underline-offset-2 hover:underline">
        Central Bank of Sri Lanka Daily Price Report
      </a>
      . Weather:{" "}
      <a href="https://open-meteo.com/" className="underline-offset-2 hover:underline">
        Open-Meteo
      </a>{" "}
      (CC BY 4.0). Forecasts are estimates, not advice.
    </p>
  );
}

const COLS: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/#how", label: "How it works" },
      { href: "/#owners", label: "What you get" },
      { href: "/#accuracy", label: "Accuracy" },
      { href: "/#live", label: "This week's prices" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/sign-up", label: "Create an account" },
      { href: "/sign-in", label: "Sign in" },
      { href: "/app/kitchen", label: "My kitchen" },
      { href: "/app/track-record", label: "Track record" },
    ],
  },
  {
    title: "Data",
    links: [
      { href: "/about", label: "Method and limits" },
      { href: "/developers", label: "API" },
      { href: "https://www.cbsl.gov.lk/en/statistics/economic-indicators/price-report", label: "CBSL Daily Price Report", external: true },
      { href: "https://open-meteo.com/", label: "Open-Meteo weather", external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 pt-12 pb-8 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Vegetable price warnings for Sri Lankan rice-and-curry kitchens, a week before the market moves.
              <span className="mt-2 block">
                <em>Mila</em> (මිල) means price in Sinhala.
              </span>
            </p>
          </div>
          {COLS.map((c) => (
            <div key={c.title}>
              <h2 className="text-sm font-medium">{c.title}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {c.links.map((l) =>
                  l.external ? (
                    <li key={l.href}>
                      <a href={l.href} className="text-muted-foreground hover:text-foreground">
                        {l.label}
                      </a>
                    </li>
                  ) : (
                    <li key={l.href}>
                      <Link href={l.href} className="text-muted-foreground hover:text-foreground">
                        {l.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t pt-6 text-xs leading-relaxed text-muted-foreground md:flex-row md:items-start md:justify-between">
          <Attribution className="max-w-2xl" />
          <p className="shrink-0">Built for ModelX 2.0 by team Segfault Society. Free pilot.</p>
        </div>
      </div>
    </footer>
  );
}
