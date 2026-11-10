import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/next-path";
import { AuthForm } from "../auth-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create an account" };

export default async function Page(props: PageProps<"/sign-up">) {
  const next = safeNext((await props.searchParams).next);
  if (await getSessionUser()) redirect(next);
  return <AuthForm mode="sign-up" next={next} />;
}
