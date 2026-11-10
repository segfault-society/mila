import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { requireUser } from "@/lib/auth/session";
import { getKitchenForUser } from "@/lib/data";
import { dayYear } from "@/lib/format";
import { viewLabel } from "@/lib/markets";
import { DeleteKitchen, SignOutButton } from "./account-buttons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account" };

function initials(name?: string | null, email?: string | null) {
  const parts = (name || email || "?").trim().split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b py-8 first:pt-0 last:border-b-0 md:grid-cols-[240px_1fr] md:gap-10">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">{children}</div>
    </section>
  );
}

export default async function AccountPage(props: PageProps<"/app/account">) {
  const user = await requireUser();
  const deleted = (await props.searchParams).deleted === "1";
  const kitchen = await getKitchenForUser(user.id);
  const created = user.createdAt ? new Date(user.createdAt).toISOString().slice(0, 10) : null;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
      <h2 className="mb-8 text-2xl font-semibold tracking-tight">Account</h2>

      <Section title="Profile" description="The name and email on your Mila account.">
        <div className="flex items-center gap-4">
          <Avatar className="size-12">
            {user.image ? <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" /> : null}
            <AvatarFallback className="bg-brand-soft font-medium text-brand">{initials(user.name, user.email)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{user.name || "No name set"}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            {created && <p className="mt-0.5 text-xs text-muted-foreground">Member since {dayYear(created)}</p>}
          </div>
        </div>
      </Section>

      <Section title="Kitchen" description="Your basket and the market Mila prices it at. One kitchen per account.">
        {deleted && !kitchen && (
          <p role="status" className="mb-3 rounded-lg bg-steady-soft px-3 py-2 text-sm text-steady">
            Your kitchen and its messages were deleted.
          </p>
        )}
        {kitchen ? (
          <div className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Eatery</dt>
                <dd className="font-medium">{kitchen.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Market</dt>
                <dd className="font-medium">{viewLabel(kitchen.market, kitchen.priceType)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Items in basket</dt>
                <dd className="tabular font-medium">{Object.keys(kitchen.basket).length}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Link
                href="/app/kitchen"
                className="inline-flex h-9 items-center rounded-lg bg-foreground px-3.5 text-sm font-medium text-background shadow-xs transition hover:bg-foreground/85"
              >
                Open my kitchen
              </Link>
              <DeleteKitchen />
            </div>
            <p className="text-xs text-muted-foreground">
              Deleting removes your basket and any messages Mila recorded for you. It cannot be undone. Your sign-in
              stays, so you can set up a new kitchen later.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">You haven&apos;t set up a kitchen yet.</p>
            <Link
              href="/app/kitchen"
              className="inline-flex h-9 items-center rounded-lg bg-foreground px-3.5 text-sm font-medium text-background shadow-xs transition hover:bg-foreground/85"
            >
              Set up my kitchen
            </Link>
          </div>
        )}
      </Section>

      <Section title="Session" description="Sign out of Mila on this device.">
        <SignOutButton />
      </Section>
    </main>
  );
}
