"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 place-items-center px-4 py-16 text-center">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mila couldn&apos;t load prices just now</h1>
        <p className="mt-2 text-muted-foreground">The price database did not answer. Please try again in a moment.</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex h-10 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
