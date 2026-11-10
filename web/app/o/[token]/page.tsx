import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Freshness } from "@/components/freshness";
import { KitchenView } from "@/components/kitchen-view";
import { DemoBanner } from "@/components/notice";
import { getBoard, getHealth, getSubscriber } from "@/lib/data";
import { viewLabel, viewQuery } from "@/lib/markets";

export const dynamic = "force-dynamic";

// private link: keep it out of search engines
export const metadata: Metadata = {
  title: "Your kitchen",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function OwnerPage(props: PageProps<"/o/[token]">) {
  const { token } = await props.params;
  const sub = await getSubscriber(token);
  if (!sub) notFound();

  const [board, health] = await Promise.all([getBoard(sub.market, sub.priceType), getHealth()]);
  const label = viewLabel(sub.market, sub.priceType);
  const q = viewQuery({ market: sub.market, type: sub.priceType });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-12 sm:px-6">
        <section className="mb-5 space-y-3">
          <div>
            <p className="text-sm text-muted-foreground">Your kitchen</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{sub.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your basket, priced at <span className="font-medium text-foreground">{label}</span>.
            </p>
          </div>
          <Freshness health={health} run={board.run} />
          {board.run?.demo && <DemoBanner />}
        </section>
        <KitchenView sub={sub} board={board} label={label} itemHref={(k) => `/app/items/${k}${q}`} />
      </main>
      <SiteFooter />
    </>
  );
}
