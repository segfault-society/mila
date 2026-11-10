"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { isAuthError } from "@neondatabase/auth/next";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

type Mode = "sign-in" | "sign-up";

const input =
  "h-10 w-full rounded-lg border bg-background px-3 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 aria-invalid:border-destructive";

function GoogleIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[18px]">
      <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8.1Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4Z" />
    </svg>
  );
}

function message(err: { message?: string; code?: string; status?: number } | null | undefined, mode: Mode): string {
  const code = String(err?.code ?? "").toUpperCase();
  const text = err?.message ?? "";
  if (code.includes("INVALID_EMAIL_OR_PASSWORD") || code.includes("INVALID_CREDENTIALS") || (mode === "sign-in" && err?.status === 401))
    return "That email and password don't match an account.";
  if (code.includes("ALREADY_EXISTS") || /already exists/i.test(text)) return "There's already an account with that email. Sign in instead.";
  if (code.includes("PASSWORD_TOO_SHORT") || /too short/i.test(text)) return "Use a password of at least 8 characters.";
  if (err?.status === 429) return "Too many tries. Wait a minute and try again.";
  return err?.message || (mode === "sign-in" ? "Couldn't sign you in. Try again." : "Couldn't create your account. Try again.");
}

export function AuthForm({ mode, next }: { mode: Mode; next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"email" | "google" | null>(null);
  const signUp = mode === "sign-up";
  const other = signUp ? "/sign-in" : "/sign-up";
  const otherHref = next === "/app" ? other : `${other}?next=${encodeURIComponent(next)}`;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    const name = String(f.get("name") ?? "").trim();
    setError(null);
    setPending("email");
    try {
      const res = signUp
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password });
      if (res.error) {
        setError(message(res.error, mode));
        setPending(null);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch (e) {
      // the Neon client throws a normalised AuthError for 4xx/5xx answers
      setError(
        isAuthError(e)
          ? message({ message: e.message, code: e.code, status: e.status }, mode)
          : "Mila couldn't reach the sign-in service. Check your connection and try again.",
      );
      setPending(null);
    }
  }

  async function onGoogle() {
    setError(null);
    setPending("google");
    try {
      const res = await authClient.signIn.social({ provider: "google", callbackURL: next });
      if (res?.error) {
        setError(message(res.error, mode));
        setPending(null);
      }
    } catch (e) {
      setError(isAuthError(e) ? message({ message: e.message, code: e.code, status: e.status }, mode) : "Mila couldn't reach Google. Try again.");
      setPending(null);
    }
  }

  return (
    <div className="w-full max-w-[400px]">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{signUp ? "Create your Mila account" : "Sign in to Mila"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {signUp
            ? "Free during the pilot. Set up your kitchen in about two minutes."
            : "Welcome back. See what your basket will cost next week."}
        </p>
      </div>

      <div className="mt-8 rounded-2xl border bg-card p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)] sm:p-7">
        <button
          type="button"
          onClick={onGoogle}
          disabled={pending != null}
          className="inline-flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border bg-background text-sm font-medium shadow-xs transition hover:bg-muted disabled:opacity-60"
        >
          {pending === "google" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <GoogleIcon />}
          Continue with Google
        </button>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or with email
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate={false}>
          {signUp && (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Your name</span>
              <input name="name" required autoComplete="name" maxLength={80} placeholder="Kamal Perera" className={input} />
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              aria-invalid={error ? true : undefined}
              className={input}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Password</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={signUp ? "new-password" : "current-password"}
              placeholder={signUp ? "At least 8 characters" : ""}
              aria-invalid={error ? true : undefined}
              className={input}
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending != null}
            className={cn(
              "inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-sm font-medium text-background shadow-sm transition hover:bg-foreground/85 disabled:opacity-60",
            )}
          >
            {pending === "email" && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {signUp ? "Create account" : "Sign in"}
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {signUp ? "Already have an account? " : "New to Mila? "}
        <Link href={otherHref} className="font-medium text-foreground underline-offset-4 hover:underline">
          {signUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
      {signUp && (
        <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
          Mila keeps your name and email only to save your kitchen. You can delete your kitchen any time from your account.
        </p>
      )}
    </div>
  );
}
