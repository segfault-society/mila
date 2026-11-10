import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell/app-shell";
import { Attribution } from "@/components/site-footer";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Everything under /app needs a signed-in owner. */
export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const { name, email, image } = await requireUser();
  return (
    <AppShell user={{ name: name ?? null, email, image: image ?? null }}>
      {children}
      <footer className="mt-auto border-t px-4 py-5 text-xs leading-relaxed text-muted-foreground sm:px-6">
        <Attribution className="max-w-3xl" />
      </footer>
    </AppShell>
  );
}
