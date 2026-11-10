"use client";

import { useActionState } from "react";
import { savePackets, type PacketsFormState } from "./actions";

/** Inline edit for "rice packets you sell a day". Blank clears it. */
export function PacketsForm({ packets }: { packets: number | null }) {
  const [state, action, pending] = useActionState<PacketsFormState, FormData>(savePackets, {});
  return (
    <form action={action} className="space-y-1.5">
      <label htmlFor="packets" className="block text-sm font-medium">
        Rice packets you sell a day
      </label>
      <div className="flex items-center gap-2">
        <input
          id="packets"
          name="packets"
          type="number"
          min={1}
          max={5000}
          step={1}
          inputMode="numeric"
          placeholder="e.g. 150"
          defaultValue={packets ?? ""}
          key={packets ?? "none"}
          aria-describedby="packets-msg"
          className="h-9 w-28 rounded-lg border bg-background px-3 text-right text-sm tabular-nums shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-lg bg-foreground px-3.5 text-sm font-medium text-background shadow-xs transition hover:bg-foreground/85 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <p id="packets-msg" className="text-xs" aria-live="polite">
        {state.error ? (
          <span role="alert" className="text-red-600 dark:text-red-400">
            {state.error}
          </span>
        ) : state.saved && !pending ? (
          <span className="text-muted-foreground">Saved.</span>
        ) : (
          <span className="text-muted-foreground">From 1 to 5,000. Leave blank to remove it.</span>
        )}
      </p>
    </form>
  );
}
