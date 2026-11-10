"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { parsePackets } from "@/lib/planner";

export type PacketsFormState = { error?: string; saved?: boolean };

/** Set (or clear) how many rice packets the signed-in owner's kitchen sells a day. */
export async function savePackets(_prev: PacketsFormState, form: FormData): Promise<PacketsFormState> {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return { error: "Please sign in again." };

  const parsed = parsePackets(form.get("packets"));
  if ("error" in parsed) return { error: parsed.error };

  const rows = await db()`
    update subscribers set packets_per_day = ${parsed.value}
    where user_id = ${user.id} and active
    returning id`;
  if (rows.length === 0) return { error: "Set up your kitchen first." };

  revalidatePath("/app/planner");
  return { saved: true };
}
