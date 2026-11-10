import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-5xl flex-1 place-items-center px-4 py-16 text-center">
        <div>
          <p className="text-sm text-muted-foreground">404</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">We couldn&apos;t find that page</h1>
          <p className="mt-2 text-muted-foreground">
            If this was your private Mila link, check that it was copied in full.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex h-10 items-center rounded-lg bg-foreground px-5 text-sm font-medium text-background"
          >
            Go to the home page
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
