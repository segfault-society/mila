import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto max-w-5xl px-4 py-6 text-xs leading-relaxed text-muted-foreground">
        <p>
          Data: Central Bank of Sri Lanka Daily Price Report; weather:{" "}
          <a href="https://open-meteo.com/" className="underline underline-offset-2 hover:text-foreground">
            Open-Meteo
          </a>{" "}
          (CC BY 4.0). Mila&apos;s forecasts are estimates, not advice.
        </p>
        <p className="mt-1.5">
          <Link href="/about" className="underline underline-offset-2 hover:text-foreground">
            How Mila works
          </Link>{" "}
          · ModelX 2.0 · Team Segfault Society
        </p>
      </div>
    </footer>
  );
}
