import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { safeNext } from "@/lib/next-path";

/**
 * One session lookup per request, shared by the app layout and its pages. The proxy refreshes session cookies
 * before render; if a lookup still fails here (for example it tries to set a cookie mid-render), treat the visitor
 * as signed out rather than failing the whole page.
 */
export const getSessionUser = cache(async () => {
  try {
    const { data: session } = await auth.getSession();
    return session?.user ?? null;
  } catch {
    return null;
  }
});

/** The signed-in user, or a redirect to sign-in that comes back to the requested app path. */
export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    const path = safeNext((await headers()).get("x-mila-path"), "/app");
    redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  }
  return user;
}
