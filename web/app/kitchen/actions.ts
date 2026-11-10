"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { getItems } from "@/lib/data";
import { db } from "@/lib/db";
import { MARKET_VIEWS } from "@/lib/markets";

export type KitchenFormState = { error?: string };

/** Create the signed-in owner's kitchen (one per Google account), then open its page. */
export async function createKitchen(_prev: KitchenFormState, form: FormData): Promise<KitchenFormState> {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return { error: "Please sign in again." };

  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  if (name.length < 2) return { error: "Give your eatery a name." };

  const [market, type] = String(form.get("view") ?? "").split(":");
  const view = MARKET_VIEWS.find((v) => v.market === market && v.type === type);
  if (!view) return { error: "Pick where you buy." };

  const items = (await getItems()).filter((i) => i.basket);
  const basket: Record<string, number> = {};
  for (const item of items) {
    const q = Number(form.get(`qty:${item.key}`));
    if (Number.isFinite(q) && q > 0 && q <= 1000) basket[item.key] = Math.round(q * 100) / 100;
  }
  if (Object.keys(basket).length < 3) return { error: "Add at least three items you buy." };

  const token = randomBytes(9).toString("base64url");
  await db()`
    insert into subscribers (name, market, price_type, basket, token, user_id, email)
    values (${name}, ${view.market}, ${view.type}, ${JSON.stringify(basket)}::jsonb, ${token}, ${user.id}, ${user.email})
    on conflict (user_id) do nothing`;
  const rows = await db()`select token from subscribers where user_id = ${user.id} limit 1`;
  redirect(`/o/${rows[0].token}`);
}
