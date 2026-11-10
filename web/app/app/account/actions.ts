"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";

/** Delete the signed-in owner's kitchen and its message log (cascade). The sign-in account itself is untouched. */
export async function deleteKitchen(): Promise<void> {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) redirect("/sign-in?next=/app/account");
  await db()`delete from subscribers where user_id = ${user.id}`;
  revalidatePath("/app", "layout");
  redirect("/app/account?deleted=1");
}
