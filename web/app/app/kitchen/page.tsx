import type { Metadata } from "next";
import Link from "next/link";
import { Freshness } from "@/components/freshness";
import { KitchenView } from "@/components/kitchen-view";
import { DemoBanner } from "@/components/notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getBoard, getHealth, getItems, getKitchenForUser } from "@/lib/data";
import { MARKET_VIEWS, viewLabel, viewQuery } from "@/lib/markets";
import { KitchenForm } from "./kitchen-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My kitchen" };

export default async function KitchenPage() {
  const user = await requireUser();
  const kitchen = await getKitchenForUser(user.id);

  if (!kitchen) {
    const items = (await getItems()).filter((i) => i.basket);
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Set up your kitchen</CardTitle>
            <CardDescription>
              Tell Mila what you buy, where, and how much a day. Mila then prices your basket for next week and flags
              the items about to jump.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <KitchenForm items={items} views={MARKET_VIEWS} />
          </CardContent>
        </Card>
      </main>
    );
  }

  const [board, health] = await Promise.all([getBoard(kitchen.market, kitchen.priceType), getHealth()]);
  const label = viewLabel(kitchen.market, kitchen.priceType);
  const q = viewQuery({ market: kitchen.market, type: kitchen.priceType });

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
      <section className="mb-5 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{kitchen.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your basket, priced at <span className="font-medium text-foreground">{label}</span>.
            </p>
          </div>
          <Link href={`/o/${kitchen.token}`} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Private link for your phone
          </Link>
        </div>
        <Freshness health={health} run={board.run} />
        {board.run?.demo && <DemoBanner />}
      </section>
      <KitchenView
        sub={kitchen}
        board={board}
        label={label}
        itemHref={(k) => `/app/items/${k}${q}`}
        plannerHref="/app/planner"
      />
    </main>
  );
}
