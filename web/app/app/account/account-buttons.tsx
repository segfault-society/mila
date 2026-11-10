"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { deleteKitchen } from "./actions";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
      className="inline-flex h-9 items-center gap-2 rounded-lg border bg-background px-3.5 text-sm font-medium shadow-xs transition hover:bg-muted disabled:opacity-60"
    >
      <LogOut className="size-4" aria-hidden />
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

function ConfirmDelete() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-9 items-center rounded-lg bg-destructive px-3.5 text-sm font-medium text-white shadow-xs transition hover:bg-destructive/90 disabled:opacity-60"
    >
      {pending ? "Deleting…" : "Yes, delete my kitchen"}
    </button>
  );
}

/** Two-step delete so a stray tap can't remove the kitchen. */
export function DeleteKitchen() {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="inline-flex h-9 items-center rounded-lg border border-destructive/40 px-3.5 text-sm font-medium text-destructive transition hover:bg-destructive/10"
      >
        Delete my kitchen
      </button>
    );
  }
  return (
    <form action={deleteKitchen} className="flex flex-wrap items-center gap-2">
      <ConfirmDelete />
      <button
        type="button"
        onClick={() => setAsking(false)}
        className="inline-flex h-9 items-center rounded-lg px-3.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Cancel
      </button>
    </form>
  );
}
