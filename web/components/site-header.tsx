import Link from "next/link";

export function SiteHeader({ homeHref = "/" }: { homeHref?: string }) {
  return (
    <header className="border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 sticky top-0 z-20">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href={homeHref} className="group flex items-center gap-2.5" aria-label="Mila home">
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-lg bg-brand text-[15px] font-semibold text-background shadow-sm"
          >
            M
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[17px] font-semibold tracking-tight">Mila</span>
            <span className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">price warnings, 7 days ahead</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href={homeHref}
            className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Prices
          </Link>
          <Link
            href="/about"
            className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            How it works
          </Link>
        </nav>
      </div>
    </header>
  );
}
