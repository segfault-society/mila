"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

const linkClass =
  "rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground";

/** Header control: "My kitchen" for everyone (it asks to sign in), plus sign-out when signed in. */
export function AuthButton() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  return (
    <>
      <Link href="/kitchen" className={linkClass}>
        My kitchen
      </Link>
      {!isPending && session?.user ? (
        <button
          type="button"
          className={linkClass}
          onClick={async () => {
            await authClient.signOut();
            router.push("/");
            router.refresh();
          }}
        >
          Sign out
        </button>
      ) : null}
    </>
  );
}

export function GoogleSignIn({ callbackURL = "/kitchen" }: { callbackURL?: string }) {
  return (
    <button
      type="button"
      onClick={() => authClient.signIn.social({ provider: "google", callbackURL })}
      className="inline-flex h-11 items-center justify-center gap-3 rounded-lg border bg-background px-5 text-sm font-medium shadow-sm transition hover:bg-muted"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-5">
        <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8.1Z" />
        <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23Z" />
        <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8Z" />
        <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4Z" />
      </svg>
      Continue with Google
    </button>
  );
}
