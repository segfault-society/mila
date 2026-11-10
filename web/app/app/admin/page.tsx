import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSessionUser, requireUser } from "@/lib/auth/session";
import { dayYear, stamp } from "@/lib/format";
import {
  ago,
  getArchiveStats,
  getCounts,
  getRecentMessages,
  getRecentRuns,
  getReviewQueue,
  getSources,
  isAdmin,
  type ReviewDoc,
  type SourceRow,
} from "@/lib/ops";
import { SIGNAL_META, SIGNAL_ORDER } from "@/lib/signals";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
/** Non-admins get the generic 404, so the tab title should not name the console either. */
export async function generateMetadata(): Promise<Metadata> {
  const user = await getSessionUser();
  return isAdmin(user) ? { title: "Ops console" } : {};
}

const int = new Intl.NumberFormat("en");

type Tone = "ok" | "warn" | "bad" | "off";

const DOT: Record<Tone, string> = {
  ok: "bg-steady",
  warn: "bg-rise",
  bad: "bg-spike",
  off: "bg-muted-foreground/50",
};

function Dot({ tone, pulse }: { tone: Tone; pulse?: boolean }) {
  return (
    <span aria-hidden className="relative inline-flex size-2 shrink-0">
      {pulse && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", DOT[tone])} />}
      <span className={cn("relative inline-flex size-2 rounded-full", DOT[tone])} />
    </span>
  );
}

function Status({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
      <Dot tone={tone} pulse={tone === "bad"} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------- sources

const SOURCE_LABEL: Record<string, { name: string; detail: string; staleAfterHours: number }> = {
  cbsl_prices: { name: "CBSL Daily Price Report", detail: "cbsl_prices", staleAfterHours: 4 * 24 },
  open_meteo: { name: "Open-Meteo weather", detail: "open_meteo", staleAfterHours: 2 * 24 },
};

function sourceStatus(s: SourceRow, now: number): { tone: Tone; label: string } {
  const failing = s.lastErrorAt && (!s.lastSuccessAt || Date.parse(s.lastErrorAt) > Date.parse(s.lastSuccessAt));
  if (failing) return { tone: "bad", label: "Failing" };
  if (!s.lastSuccessAt) return { tone: "off", label: "Never run" };
  const hours = (now - Date.parse(s.lastSuccessAt)) / 3_600_000;
  const limit = SOURCE_LABEL[s.source]?.staleAfterHours ?? 48;
  if (hours > limit) return { tone: "warn", label: "Stale" };
  return { tone: "ok", label: "Healthy" };
}

// ---------------------------------------------------------------- review queue

const RULE_LABEL: Record<string, string> = {
  duplicate_conflict: "Conflicting duplicates",
  date_mismatch: "Date mismatch",
  jump: "Price jump",
  range: "Out of range",
  unit: "Unit mismatch",
  coverage: "Too few prices",
};

function series(d: Record<string, unknown>): string {
  return Array.isArray(d.series) ? d.series.join(" / ") : "";
}

function describe(rule: string, d: Record<string, unknown> | null): string {
  if (!d) return "";
  const v = (x: unknown) => (x == null ? "blank" : String(x));
  switch (rule) {
    case "date_mismatch":
      return `title ${v(d.title_date)}, listing ${v(d.listing_date)}`;
    case "duplicate_conflict":
      return `${series(d)}: ${JSON.stringify(d.a)} vs ${JSON.stringify(d.b)}`;
    case "jump":
      return `${series(d)}: ${v(d.previous)} to ${v(d.today)}`;
    case "range":
      return `${series(d)}: comparison ${v(d.comparison)}`;
    case "unit":
      return `${series(d)}: ${v(d.unit)}, expected ${v(d.expected)}`;
    case "coverage":
      return `${v(d.basket_prices)} basket prices, needs ${v(d.minimum)}`;
    default: {
      const s = JSON.stringify(d);
      return s.length > 90 ? `${s.slice(0, 90)}…` : s;
    }
  }
}

function Reason({ doc }: { doc: ReviewDoc }) {
  if (!doc.parseError && doc.rules.length === 0) {
    return <span className="text-muted-foreground">Held for review, no reason recorded</span>;
  }
  return (
    <div className="space-y-1.5">
      {doc.parseError && (
        <p className="font-mono text-xs leading-relaxed break-words text-foreground/90">{doc.parseError}</p>
      )}
      {doc.rules.map((r) => (
        <p key={r.rule} className="text-xs leading-relaxed">
          <span className="font-medium">{RULE_LABEL[r.rule] ?? r.rule}</span>
          {r.count > 1 && <span className="tabular text-muted-foreground"> ×{r.count}</span>}
          {r.example && (
            <span className="text-muted-foreground">
              {" "}
              (e.g. <span className="font-mono">{describe(r.rule, r.example)}</span>)
            </span>
          )}
        </p>
      ))}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const failed = status === "failed";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-xs font-medium",
        failed ? "bg-spike-soft text-spike" : "bg-rise-soft text-rise",
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", failed ? "bg-spike" : "bg-rise")} />
      {failed ? "Failed" : "Review"}
    </span>
  );
}

// ---------------------------------------------------------------- messages

function messageTone(status: string): Tone {
  const s = status.toLowerCase();
  if (["sent", "delivered", "ok", "accepted"].includes(s)) return "ok";
  if (["failed", "error", "bounced", "rejected", "undelivered"].includes(s)) return "bad";
  if (["queued", "pending", "sending", "scheduled"].includes(s)) return "warn";
  return "off";
}

// ---------------------------------------------------------------- layout bits

function Tile({ label, value, note }: { label: string; value: string; note?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function When({ ts, now }: { ts: string | null; now: number }) {
  if (!ts) return <span className="text-muted-foreground">Never</span>;
  return (
    <time dateTime={ts} title={`${stamp(ts)} Sri Lanka time`} className="whitespace-nowrap">
      {ago(ts, now)}
      <span className="block text-xs text-muted-foreground">{stamp(ts)}</span>
    </time>
  );
}

const ARCHIVE_SEGMENTS: { key: string; label: string; bar: string }[] = [
  { key: "parsed", label: "Parsed", bar: "bg-steady" },
  { key: "review", label: "Held for review", bar: "bg-rise" },
  { key: "failed", label: "Failed", bar: "bg-spike" },
  { key: "pending", label: "Pending", bar: "bg-muted-foreground/50" },
];

async function load() {
  const [sources, runs, archive, queue, messages, counts] = await Promise.all([
    getSources(),
    getRecentRuns(20),
    getArchiveStats(),
    getReviewQueue(200),
    getRecentMessages(50),
    getCounts(),
  ]);
  return { sources, runs, archive, queue, messages, counts, now: Date.now() };
}

export default async function AdminPage() {
  const user = await requireUser();
  if (!isAdmin(user)) notFound();

  const { sources, runs, archive, queue, messages, counts, now } = await load();
  const queueSize = archive.byStatus.failed + archive.byStatus.review;
  const failingSources = sources.filter((s) => sourceStatus(s, now).tone === "bad").length;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Ops console</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Read-only view of the data pipeline, the CBSL archive and outgoing messages. Times are Sri Lanka time.
          </p>
        </div>
        <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Dot tone={failingSources ? "bad" : "ok"} />
          {failingSources ? `${failingSources} ${failingSources === 1 ? "source" : "sources"} failing` : "All sources healthy"} · loaded {stamp(new Date(now).toISOString())}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Kitchens" value={int.format(counts.kitchens)} note={`${int.format(counts.activeKitchens)} active`} />
        <Tile
          label="Alert events"
          value={counts.alertEvents == null ? "—" : int.format(counts.alertEvents)}
          note={counts.alertRules == null ? "alerts not set up" : `${int.format(counts.alertRules)} active ${counts.alertRules === 1 ? "rule" : "rules"}`}
        />
        <Tile label="Messages logged" value={int.format(counts.messages)} note="email and SMS" />
        <Tile label="Validated prices" value={int.format(counts.prices)} note="in the prices table" />
        <Tile label="Forecast runs" value={runs.length ? `#${runs[0].id}` : "—"} note={runs.length ? `latest, ${ago(runs[0].createdAt, now)}` : "none yet"} />
        <Tile label="Review queue" value={int.format(queueSize)} note={`${archive.byStatus.failed} failed, ${archive.byStatus.review} held`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data sources</CardTitle>
          <CardDescription>Last fetch per source, from source_health. A source is failing when its last error is newer than its last success.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 sm:pl-2">Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last success</TableHead>
                <TableHead>Data up to</TableHead>
                <TableHead>Last error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    No source has reported yet.
                  </TableCell>
                </TableRow>
              )}
              {sources.map((s) => {
                const st = sourceStatus(s, now);
                const meta = SOURCE_LABEL[s.source];
                return (
                  <TableRow key={s.source} className="align-top">
                    <TableCell className="pl-4 sm:pl-2">
                      <span className="font-medium">{meta?.name ?? s.source}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{s.source}</span>
                    </TableCell>
                    <TableCell>
                      <Status tone={st.tone} label={st.label} />
                    </TableCell>
                    <TableCell>
                      <When ts={s.lastSuccessAt} now={now} />
                    </TableCell>
                    <TableCell className="tabular">{dayYear(s.lastDataDate)}</TableCell>
                    <TableCell className="max-w-[360px] whitespace-normal">
                      {s.lastError ? (
                        <>
                          <p className="font-mono text-xs break-words text-spike">{s.lastError}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{ago(s.lastErrorAt, now)}</p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Recent forecast runs</CardTitle>
            <CardDescription>The last {runs.length} runs and how their forecasts split by signal.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 sm:px-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 sm:pl-2">Run</TableHead>
                  <TableHead>Data date</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Signals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                      No forecast runs yet.
                    </TableCell>
                  </TableRow>
                )}
                {runs.map((r, i) => (
                  <TableRow key={r.id} className="align-top">
                    <TableCell className="tabular pl-4 font-medium sm:pl-2">
                      #{r.id}
                      {i === 0 && (
                        <span className="ml-1.5 rounded-full bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand">
                          live
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular">{dayYear(r.dataDate)}</TableCell>
                    <TableCell>
                      <When ts={r.createdAt} now={now} />
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{r.modelVersion}</span>
                      {r.trainRows != null && (
                        <span className="tabular block text-xs text-muted-foreground">
                          {int.format(r.trainRows)} training rows
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex h-1.5 w-40 overflow-hidden rounded-full bg-muted" aria-hidden>
                        {r.total > 0 &&
                          SIGNAL_ORDER.map((sig) =>
                            r.signals[sig] ? (
                              <span
                                key={sig}
                                className={SIGNAL_META[sig].dot}
                                style={{ width: `${(r.signals[sig] / r.total) * 100}%` }}
                              />
                            ) : null,
                          )}
                      </div>
                      <div className="tabular mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs">
                        {SIGNAL_ORDER.map((sig) => (
                          <span key={sig} title={SIGNAL_META[sig].label} className="inline-flex items-center gap-1">
                            <span aria-hidden className={cn("size-1.5 rounded-full", SIGNAL_META[sig].dot)} />
                            <span className="sr-only">{SIGNAL_META[sig].label}: </span>
                            {r.signals[sig]}
                          </span>
                        ))}
                        <span className="text-muted-foreground">of {r.total}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 px-4 text-xs text-muted-foreground sm:px-2">
              {SIGNAL_ORDER.map((sig) => (
                <span key={sig} className="inline-flex items-center gap-1">
                  <span aria-hidden className={cn("size-1.5 rounded-full", SIGNAL_META[sig].dot)} />
                  {SIGNAL_META[sig].label}
                </span>
              ))}
            </p>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>CBSL archive</CardTitle>
            <CardDescription>Daily Price Report PDFs on file, by parse status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="tabular text-3xl font-semibold tracking-tight">{int.format(archive.total)}</p>
              <p className="text-xs text-muted-foreground">reports on file</p>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              {archive.total > 0 &&
                ARCHIVE_SEGMENTS.map((seg) =>
                  archive.byStatus[seg.key] ? (
                    <span
                      key={seg.key}
                      className={seg.bar}
                      style={{ width: `${(archive.byStatus[seg.key] / archive.total) * 100}%` }}
                    />
                  ) : null,
                )}
            </div>
            <ul className="space-y-1.5 text-sm">
              {ARCHIVE_SEGMENTS.map((seg) => (
                <li key={seg.key} className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden className={cn("size-2 rounded-full", seg.bar)} />
                    {seg.label}
                  </span>
                  <span className="tabular font-medium">{int.format(archive.byStatus[seg.key] ?? 0)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-t pt-4 text-sm">
              {[
                { k: "Latest report", v: dayYear(archive.latestReport) },
                { k: "Latest parsed", v: dayYear(archive.latestParsed) },
                { k: "First report", v: dayYear(archive.firstReport) },
                { k: "Last fetched", v: archive.lastFetchedAt ? ago(archive.lastFetchedAt, now) : "Never" },
              ].map((d) => (
                <div key={d.k} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{d.k}</dt>
                  <dd className="tabular">{d.v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card id="review">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Review queue
            <span className="tabular rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {int.format(queue.total)}
            </span>
          </CardTitle>
          <CardDescription>
            Reports that failed to parse or were held by a validation error, newest first. Their prices are not used.
            {queue.docs.length < queue.total ? ` Showing the newest ${queue.docs.length}.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-4">
          {queue.docs.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing to review.</p>
          ) : (
            <div className="max-h-[640px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="pl-4 sm:pl-2">Report date</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="pr-4 text-right sm:pr-2">Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.docs.map((d) => (
                    <TableRow key={d.id} className="align-top">
                      <TableCell className="tabular pl-4 font-medium sm:pl-2">{dayYear(d.reportDate)}</TableCell>
                      <TableCell className="font-mono text-xs">{d.fileName}</TableCell>
                      <TableCell>
                        <StatusChip status={d.status} />
                      </TableCell>
                      <TableCell className="min-w-[280px] whitespace-normal">
                        <Reason doc={d} />
                      </TableCell>
                      <TableCell className="pr-4 text-right sm:pr-2">
                        <a
                          href={d.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                          CBSL PDF
                          <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Messages log</CardTitle>
          <CardDescription>The last 50 messages Mila sent or tried to send. Kitchen name only; no contact details or message text.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 sm:pl-2">Created</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 sm:pr-2">Kitchen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                    No messages logged yet.
                  </TableCell>
                </TableRow>
              )}
              {messages.map((m) => (
                <TableRow key={m.id} className="align-top">
                  <TableCell className="pl-4 sm:pl-2">
                    <When ts={m.createdAt} now={now} />
                  </TableCell>
                  <TableCell className="capitalize">{m.channel}</TableCell>
                  <TableCell>
                    <Status tone={messageTone(m.status)} label={m.status} />
                  </TableCell>
                  <TableCell className="pr-4 sm:pr-2">
                    {m.kitchen ?? <span className="text-muted-foreground">No kitchen</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
