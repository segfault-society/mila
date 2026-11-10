-- Mila schema. Every price carries the raw document it came from; every forecast carries its run.

create table raw_documents (
  id           bigserial primary key,
  report_date  date not null,
  source_url   text not null unique,
  file_name    text not null,
  sha256       text not null,
  bytes        integer not null,
  fetched_at   timestamptz not null,
  blob_url     text,
  parse_status text not null default 'pending'
               check (parse_status in ('pending', 'parsed', 'failed', 'review')),
  parser       text,
  parse_error  text,
  parsed_at    timestamptz
);
create index raw_documents_report_date on raw_documents (report_date);

create table items (
  item_key     text primary key,
  display_name text not null,
  category     text not null,
  unit         text not null,
  region       text,
  basket       boolean not null default false
);

-- One row per item, market and price type per trading day ("Today" column of that day's report).
create table prices (
  obs_date      date not null,
  item_key      text not null references items,
  market        text not null,
  price_type    text not null check (price_type in ('wholesale', 'retail')),
  price         numeric(10, 2) not null check (price > 0),
  source_doc_id bigint not null references raw_documents (id) on delete cascade,
  primary key (obs_date, item_key, market, price_type)
);
create index prices_series on prices (item_key, market, price_type, obs_date);

-- The comparison column ("Yesterday" / "Last Friday") repeats the previous trading day's price.
-- Comparing it with that day's own report is a free, automatic accuracy check on the parser.
create table price_echoes (
  report_date     date not null,
  comparison_date date,
  item_key        text not null references items,
  market          text not null,
  price_type      text not null,
  price           numeric(10, 2) not null,
  source_doc_id   bigint not null references raw_documents (id) on delete cascade,
  primary key (report_date, item_key, market, price_type)
);

create table validation_issues (
  id            bigserial primary key,
  source_doc_id bigint references raw_documents (id) on delete cascade,
  severity      text not null check (severity in ('error', 'warning')),
  rule          text not null,
  detail        jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index validation_issues_doc on validation_issues (source_doc_id);

create table weather_daily (
  point_key  text not null,
  obs_date   date not null,
  source     text not null check (source in ('archive', 'forecast')),
  precip_mm  real,
  tmax_c     real,
  tmin_c     real,
  fetched_at timestamptz not null default now(),
  primary key (point_key, obs_date, source)
);

create table source_health (
  source          text primary key,
  last_success_at timestamptz,
  last_data_date  date,
  last_error      text,
  last_error_at   timestamptz
);

create table forecast_runs (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  data_date     date not null,
  horizon_days  integer not null,
  model_version text not null,
  train_rows    integer,
  notes         jsonb not null default '{}'
);

create table forecasts (
  run_id         bigint not null references forecast_runs (id) on delete cascade,
  item_key       text not null references items,
  market         text not null,
  price_type     text not null,
  base_date      date not null,
  base_price     numeric(10, 2) not null,
  target_date    date not null,
  q10            numeric(10, 2),
  q50            numeric(10, 2),
  q90            numeric(10, 2),
  spike_prob     real,
  signal         text not null check (signal in ('spike', 'rise', 'steady', 'fall', 'no_forecast')),
  abstain_reason text,
  drivers        jsonb not null default '[]',
  primary key (run_id, item_key, market, price_type)
);

-- Backtest scorecard per item, shown on the dashboard as "Mila's record".
create table backtest_scores (
  run_label  text not null,
  item_key   text not null,
  metric     text not null,
  value      double precision,
  created_at timestamptz not null default now(),
  primary key (run_label, item_key, metric)
);

-- Phone numbers live only here (never in git) and are deleted on STOP.
create table subscribers (
  id         bigserial primary key,
  name       text not null,
  phone_e164 text unique,
  market     text not null default 'pettah',
  price_type text not null default 'wholesale',
  basket     jsonb not null default '{}',
  lang       text not null default 'en',
  token      text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table messages (
  id            bigserial primary key,
  subscriber_id bigint references subscribers (id) on delete cascade,
  run_id        bigint references forecast_runs (id) on delete set null,
  channel       text not null,
  body          text not null,
  status        text not null,
  provider_id   text,
  created_at    timestamptz not null default now()
);
