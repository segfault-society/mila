# Mila

**Short-horizon food price warnings for small Sri Lankan eateries.** Mila reads the Central Bank of Sri
Lanka's Daily Price Report every trading day, joins it with rainfall in the vegetable growing areas, and
forecasts each item's price 7 days ahead with a calibrated range, a spike probability (a rise of 25% or more),
and plain-language reasons. When the data is stale, conditions are outside its history, or its range is too
wide to act on, it says **"no forecast this week"** instead of guessing.

ModelX 2.0, team **Segfault Society** (Informatics Institute of Technology).

| | |
|---|---|
| Live dashboard | https://mila-taprona.vercel.app |
| Scorecard (backtest) | [`reports/backtest.md`](reports/backtest.md) |
| Unattended pipeline | Trigger.dev project `mila` (every 30 min, 15:00-21:00 Sri Lanka time, trading days) |

## How it works

```
CBSL listing ──► crawler ──► PDF parser ──► validation gate ──► Neon Postgres ──► features ──► LightGBM quantiles
 (2,461 PDFs)   (polite)    (all layouts)   (date/unit/range/       (prices,         (lags, spreads,   + CQR calibration
                                             jump/coverage)          echoes,          rain anomalies,   + spike probability
Open-Meteo ─────────────────────────────────────────────────────► weather_daily)    calendar)         + abstention
 (ERA5 1991-today + 16-day forecast, 8 growing-area points)                                                   │
                                                                                                              ▼
                                                    dashboard (Next.js, Vercel) ◄── forecasts + drivers ──► SMS digest
```

| Stage | Code |
|---|---|
| Crawl CBSL (resumable, robots.txt delay, honest User-Agent) | `pipeline/src/mila/cbsl/{http,listing,crawl}.py` |
| Parse every layout era (2016-19 per-category pages, 2019 three-column groups, 2020 "Yesterday", 2021+ single table) | `pipeline/src/mila/cbsl/parse.py` |
| Validation gate: title date vs listing date, unit, price range, day-over-day jump (x3 rejected), duplicate conflicts, basket coverage | `pipeline/src/mila/cbsl/validate.py` |
| Rainfall: ERA5 archive (1991-2020 normal) + forecast endpoint | `pipeline/src/mila/weather.py` |
| Features (only look backwards; rain lagged a day) | `pipeline/src/mila/features.py` |
| Model: pooled LightGBM q10/q50/q90, conformalized quantile regression, spike probability, item-relative abstention | `pipeline/src/mila/model.py` |
| Rolling-origin backtest vs persistence, seasonal naive, trend rule, rainfall rule; weather ablation; Ditwah case study | `pipeline/src/mila/{backtest,report}.py` |
| Live forecast with reasons (facts + LightGBM TreeSHAP contributions) | `pipeline/src/mila/forecast.py` |
| SMS digest (GSM-7, at most five lines) | `pipeline/src/mila/{digest,sms}.py` |
| Schedules (thin TypeScript shell around the Python CLI) | `trigger/pipeline.ts`, `trigger.config.ts` |
| Dashboard | `web/` |
| Schema | `db/migrations/0001_init.sql` |

Every price row points at the raw document it came from (`prices.source_doc_id -> raw_documents`), and every
forecast belongs to a run with its data date and model version.

## Data quality

- **Archive:** 2,430 reports from 1 Aug 2016 to 9 Nov 2026; **2,329 trading days parsed and stored, 265,927
  prices** (35 items, up to 6 market/price-type columns).
- **Parser accuracy check that comes free:** since 2019 every report repeats the previous trading day's price
  ("Yesterday" / "Last <weekday>"). Comparing that echo with the previous day's own report checks the parser
  on every cell: **208,007 of 209,389 echoes match exactly (99.34%)**. No item or column has a systematic error
  (no series has more than 15 mismatches in a year); the misses concentrate on 12 report days where the
  comparison column refers to a different day than the previous report (2020 lockdown gaps of 10-34 days, header
  dates printed as the report's own date). **Excluding those 12 days: 207,567 / 208,223 = 99.68%**, above the
  99.5% target. By year: 2019 95.6%, 2020 96.8%, 2021 99.97%, 2022 98.8%, 2023-2026 99.8-99.99%.
- **Held back, not guessed:** reports the parser cannot place (46), or whose title date disagrees with the
  listing (55, mostly a run of June 2017 reports titled a week before their listing date), go to
  `parse_status = 'failed' | 'review'` with the reason in `validation_issues`, about 4% of 2016-2019 reports.
  They are a review queue; nothing unvalidated enters `prices`. 2016-2018 reports compare against a 5-day
  average instead of the previous day, so the echo check does not cover them; golden values do.
- Golden values from one report per layout era are pinned in `pipeline/tests/test_parse_golden.py`.

## Data rights and conduct

- **CBSL Daily Price Report**: public statistical release, attributed on every page and message. Raw PDFs are
  kept privately (`data/`, gitignored) for reproducibility; only the scraper and derived tables are published.
- **robots.txt** asks for a 10-second crawl delay. The daily job uses 10 seconds. **The one-time backfill on
  10 November 2026 was run at 2 seconds per request** (single connection, stop on any 403/429) to meet the
  submission deadline; about 2,460 PDFs, roughly 1 GB. We will say so if CBSL asks, and the team intends to
  write to CBSL's Statistics Department for written confirmation, as the proposal states.
- CBSL's CloudFront rejects any User-Agent containing the word "bot"; the crawler identifies itself as
  `Mila/0.1 (Segfault Society research project; +repo URL)`.
- **Open-Meteo** (ERA5 reanalysis and forecast), CC BY 4.0.
- Subscriber phone numbers live only in the production database, never in git, and are deleted on STOP.

## What is built, and what was cut for the deadline

Built: crawler, all-era parser, validation gate, rainfall ingestion, features, quantile model with CQR,
spike probability (classifier and distribution-based, compared in the backtest), abstention, rolling-origin
backtest with baselines and weather ablation, live forecasts with reasons, dashboard, digest builder, unattended
schedules.

Cut or not yet done (in the proposal's own cut order): WhatsApp; Sinhala templates; fish and fruit modelling;
the 14-day horizon; FX features (LKR/USD, LKR/INR); mining CBSL's commentary text; OCR (no scanned reports were
found); the web onboarding form (owners are added with `mila subscriber-add`); SARIMAX and LSTM baselines; the
money-saved simulation. **SMS sending is dry-run** (messages are recorded in `messages`) until an SMS gateway
account exists. The LLM parsing fallback is not wired in: the deterministic parser plus the review queue covered
the archive.

## Run it

```bash
# Python pipeline
cd pipeline && uv sync
cp ../.env.example ../.env          # fill DATABASE_URL (Neon) - the CLI reads ../.env itself
uv run mila migrate                 # schema + item catalogue
uv run mila crawl                   # CBSL PDFs into data/raw (resumable; MILA_CRAWL_DELAY, default 10 s)
uv run mila ingest                  # parse + validate + store
uv run mila weather --full          # Open-Meteo 1991-today
uv run mila backtest                # writes reports/backtest.md and backtest_scores
uv run mila forecast                # one live forecast run
uv run mila subscriber-add "Kamal's Hotel" --basket "beans=2,carrot=1.5,big_onion_imp=3,samba=12"
uv run mila digest                  # print each subscriber's SMS (add --send to record/send)
uv run mila daily                   # what the scheduler runs
uv run pytest

# Dashboard
cd web && pnpm install && pnpm dev  # needs DATABASE_URL in web/.env.local

# Scheduler (from the repo root)
pnpm install && npx trigger.dev deploy --env prod
```

## AI assistance

The team used Claude (Anthropic) to help research and draft the proposal and as a coding assistant for this
build. Inside the running system no LLM produces any number: prices come from CBSL's reports through a
deterministic parser, and forecasts come from the model.
