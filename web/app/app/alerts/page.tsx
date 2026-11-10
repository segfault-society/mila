import type { Metadata } from "next";
import { BellRing, Mail } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getItems, getKitchenForUser } from "@/lib/data";
import { db } from "@/lib/db";
import { MARKET_VIEWS, viewLabel } from "@/lib/markets";
import { AlertForm } from "./alert-form";
import { deleteRule, markAllRead } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Alerts" };

type RuleRow = {
  id: number;
  item_key: string | null;
  item_name: string | null;
  market: string;
  price_type: string;
  kind: string;
  threshold: number;
};
type EventRow = { id: number; message: string; data_date: string; created_at: string; emailed: boolean; unread: boolean };

function describe(r: RuleRow): string {
  const what = r.item_name ?? "Any item in my kitchen";
  const at = viewLabel(r.market, r.price_type);
  if (r.kind === "spike_risk") return `${what}: spike risk ${Math.round(r.threshold * 100)}% or more (${at})`;
  const rs = `Rs ${Math.round(r.threshold).toLocaleString("en-LK")}`;
  return r.kind === "price_above"
    ? `${what}: next week above ${rs} (${at})`
    : `${what}: next week below ${rs} (${at})`;
}

function when(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Colombo",
  }).format(new Date(iso));
}

export default async function AlertsPage() {
  const user = await requireUser();
  const [kitchen, items] = await Promise.all([getKitchenForUser(user.id), getItems()]);

  const rules = (await db()`
    select r.id::int as id, r.item_key, i.display_name as item_name, r.market, r.price_type, r.kind,
           r.threshold::float as threshold
    from alert_rules r left join items i on i.item_key = r.item_key
    where r.user_id = ${user.id} and r.active order by r.created_at desc`) as RuleRow[];
  const events = (await db()`
    select e.id::int as id, e.message, e.data_date::text as data_date, to_json(e.created_at) #>> '{}' as created_at,
           e.emailed, e.read_at is null as unread
    from alert_events e join alert_rules r on r.id = e.rule_id
    where r.user_id = ${user.id} order by e.created_at desc limit 30`) as EventRow[];
  const unread = events.filter((e) => e.unread).length;

  const choices = items
    .filter((i) => i.category !== "fish")
    .sort((a, b) => Number(b.basket) - Number(a.basket) || a.name.localeCompare(b.name))
    .map((i) => ({ key: i.key, name: i.name }));
  const defaultView = kitchen ? `${kitchen.market}:${kitchen.priceType}` : "pettah:wholesale";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Mila checks your alerts after every new forecast, usually soon after the Central Bank publishes the day&apos;s
          prices. Each alert fires once per day&apos;s report, in the app and by email to {user.email}.
        </p>
      </header>

      <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <h2 className="text-sm font-semibold">New alert</h2>
        <div className="mt-4">
          <AlertForm items={choices} views={MARKET_VIEWS} defaultView={defaultView} hasKitchen={Boolean(kitchen)} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Your alerts</h2>
        {rules.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            No alerts yet. A good first one: any item in your kitchen with a spike risk of 20% or more.
          </p>
        ) : (
          <ul className="mt-3 divide-y rounded-xl bg-card ring-1 ring-foreground/10">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <span className="flex items-center gap-3 text-sm">
                  <BellRing className="size-4 shrink-0 text-brand" aria-hidden />
                  {describe(r)}
                </span>
                <form action={deleteRule}>
                  <input type="hidden" name="id" value={r.id} />
                  <button
                    type="submit"
                    className="rounded-md px-2.5 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Recent alerts{unread ? <span className="ml-2 font-normal text-muted-foreground">{unread} new</span> : null}
          </h2>
          {unread ? (
            <form action={markAllRead}>
              <button type="submit" className="rounded-md px-2.5 py-1 text-sm text-muted-foreground hover:bg-muted">
                Mark all read
              </button>
            </form>
          ) : null}
        </div>
        {events.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            Nothing yet. When a forecast crosses one of your alerts, it shows up here and in your inbox.
          </p>
        ) : (
          <ul className="mt-3 divide-y rounded-xl bg-card ring-1 ring-foreground/10">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-5 py-3.5">
                <span
                  aria-hidden
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${e.unread ? "bg-brand" : "bg-muted-foreground/30"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{e.message}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {when(e.created_at)}
                    {e.emailed ? (
                      <>
                        <Mail className="size-3" aria-hidden /> emailed
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
