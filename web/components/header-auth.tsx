"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

export const primaryBtn =
  "inline-flex h-9 items-center justify-center rounded-lg bg-foreground px-3.5 text-sm font-medium text-background shadow-sm transition-colors hover:bg-foreground/85 focus-visible:ring-3 focus-visible:ring-ring/50 outline-none";
export const ghostBtn =
  "inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 outline-none";

/** Signed out: Sign in + Get started. Signed in: Open dashboard. */
export function HeaderAuth({ className }: { className?: string }) {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) {
    return <span aria-hidden className={cn("h-9 w-40 animate-pulse rounded-lg bg-muted/70", className)} />;
  }
  if (session?.user) {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <Link href="/app" className={primaryBtn}>
          Open dashboard
        </Link>
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Link href="/sign-in" className={ghostBtn}>
        Sign in
      </Link>
      <Link href="/sign-up" className={primaryBtn}>
        Get started
      </Link>
    </div>
  );
}
