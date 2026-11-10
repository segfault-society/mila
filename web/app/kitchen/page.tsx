import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GoogleSignIn } from "@/components/auth-button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth/server";
import { getItems } from "@/lib/data";
import { db } from "@/lib/db";
import { MARKET_VIEWS } from "@/lib/markets";
import { KitchenForm } from "./kitchen-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My kitchen", robots: { index: false, follow: false } };

export default async function KitchenPage() {
  const { data: session } = await auth.getSession();
  const user = session?.user;

  if (user) {
    const rows = await db()`select token from subscribers where user_id = ${user.id} and active limit 1`;
    if (rows[0]) redirect(`/o/${rows[0].token}`);
  }

  const items = user ? (await getItems()).filter((i) => i.basket) : [];
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{user ? `Set up your kitchen, ${user.name?.split(" ")[0] ?? ""}` : "My kitchen"}</CardTitle>
            <CardDescription>
              {user
                ? "Tell Mila what you buy and where. You'll get your own page with next week's likely basket cost."
                : "Sign in to see your own basket: the items you buy, at your market, with next week's likely cost."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user ? <KitchenForm items={items} views={MARKET_VIEWS} /> : <GoogleSignIn />}
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
