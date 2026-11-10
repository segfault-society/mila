import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SignalBadge } from "@/components/signal-badge";
import type { Signal } from "@/lib/signals";

export const metadata: Metadata = {
  title: "How Mila works",
  description: "Where Mila's numbers come from, what a spike warning means, and when Mila stays silent.",
};

const SIGNALS: { signal: Signal; text: string }[] = [
  { signal: "spike", text: "Mila thinks there is a real chance the price jumps 25% or more within 7 days." },
  { signal: "rise", text: "The middle guess is at least 5% above today's price, but a spike is not likely." },
  { signal: "steady", text: "The middle guess is within 5% of today's price." },
  { signal: "fall", text: "The middle guess is at least 5% below today's price." },
  { signal: "no_forecast", text: "Mila stays silent this week, and says why." },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

export default function About() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-10 px-4 pt-8 pb-12">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">How Mila works</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            <em>Mila</em> (මිල) means &ldquo;price&rdquo; in Sinhala. Mila helps small rice-and-curry eateries
            see vegetable and rice price spikes a week before they hit, so the owner can buy early, switch a
            curry, or set the rice-packet price with eyes open.
          </p>
        </div>

        <Section title="Where the numbers come from">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Prices:</strong> the Central Bank of Sri Lanka (CBSL) Daily Price Report — wholesale and
              retail prices at Pettah, Dambulla, Narahenpita and Marandagahamula, every trading day back to August
              2016. Every price Mila shows is traced to the report it came from.
            </li>
            <li>
              <strong>Weather:</strong> daily rainfall and temperature for the main growing areas (such as Nuwara
              Eliya and Dambulla) from{" "}
              <a href="https://open-meteo.com/" className="underline underline-offset-2">
                Open-Meteo
              </a>
              , licensed CC BY 4.0. Heavy rain in the hills is one of the main reasons vegetable prices jump.
            </li>
          </ul>
        </Section>

        <Section title="What the forecast says">
          <p>
            Each morning, after the CBSL report, Mila looks 7 days ahead for each item and market. It gives a
            <strong> middle guess</strong> and an <strong>80% range</strong>: in 8 weeks out of 10, the real price
            should land inside that range. On each item page the range is drawn as a widening fan.
          </p>
          <p>
            A <strong>spike</strong> means a rise of <strong>25% or more within 7 days</strong>. The &ldquo;spike
            chance&rdquo; is how likely Mila thinks that is.
          </p>
          <ul className="space-y-2.5">
            {SIGNALS.map((s) => (
              <li key={s.signal} className="flex items-start gap-3">
                <SignalBadge signal={s.signal} size="sm" className="mt-0.5 w-[118px] justify-center" />
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="When Mila stays silent">
          <p>A wrong warning costs an owner money, so Mila would rather say nothing than guess. It shows “no forecast” when:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>the data is stale — CBSL has not reported a recent price for that item;</li>
            <li>conditions are outside anything in Mila&apos;s history, so past patterns may not apply;</li>
            <li>the 80% range is too wide to act on.</li>
          </ul>
        </Section>

        <Section title="How Mila decides">
          <p>
            Mila is a statistical model trained on years of past CBSL prices and rainfall. It learns how prices
            moved after similar weeks before — after heavy rain, at the same time of year, after a run-up at
            Pettah — and its ranges are calibrated on recent months so the 80% range really holds about 80% of
            the time. Each item page shows Mila&apos;s back-tested record for that item.
          </p>
          <p>
            <strong>Every number on this site comes from the data and the model, never from an AI chatbot or
            language model.</strong> The short reasons (&ldquo;5 days of heavy rain in Nuwara Eliya&rdquo;) are
            built from the same data the model used.
          </p>
        </Section>

        <Section title="Please remember">
          <p>
            Mila&apos;s forecasts are estimates, not advice. Prices at your local market can differ from the CBSL
            markets. Data: Central Bank of Sri Lanka Daily Price Report; weather: Open-Meteo (CC BY 4.0).
          </p>
          <p>
            <Link href="/" className="font-medium underline underline-offset-2">
              See this week&apos;s prices →
            </Link>
          </p>
        </Section>
      </main>
      <SiteFooter />
    </>
  );
}
