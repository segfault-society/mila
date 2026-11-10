import Link from "next/link";
import { Logo } from "@/components/logo";
import { HeaderAuth } from "@/components/header-auth";

const navLink = "rounded-md px-3 py-1.5 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground";

/** Public site header: logo, section links and the sign-in / dashboard buttons. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Mila home" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center text-sm md:flex">
          <Link href="/#how" className={navLink}>
            How it works
          </Link>
          <Link href="/#accuracy" className={navLink}>
            Accuracy
          </Link>
          <Link href="/#live" className={navLink}>
            This week&apos;s prices
          </Link>
          <Link href="/about" className={navLink}>
            Method
          </Link>
        </nav>
        <HeaderAuth />
      </div>
    </header>
  );
}
