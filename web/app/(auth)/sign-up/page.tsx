import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { safeNext } from "@/lib/next-path";
import { AuthForm } from "../auth-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create an account" };

export default async function Page(props: PageProps<"/sign-up">) {
  const next = safeNext((await props.searchParams).next);
  const { data: session } = await auth.getSession();
  if (session?.user) redirect(next);
  return <AuthForm mode="sign-up" next={next} />;
}
