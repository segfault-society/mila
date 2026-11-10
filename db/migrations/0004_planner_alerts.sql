-- Menu planner: how many rice packets the kitchen sells a day, to turn the basket cost into a cost per packet.
alter table subscribers add column packets_per_day integer check (packets_per_day between 1 and 5000);

-- Price alerts. A rule belongs to a signed-in owner (Neon Auth user id).
--   kind 'spike_risk'  : spike chance for the item reaches threshold (a fraction, 0.3 = 30%)
--   kind 'price_above' : next week's middle estimate goes above threshold (Rs per unit)
--   kind 'price_below' : next week's middle estimate goes below threshold (Rs per unit)
-- item_key null = any item in the owner's basket (spike_risk only).
create table alert_rules (
  id          bigserial primary key,
  user_id     text not null,
  item_key    text references items,
  market      text not null default 'pettah',
  price_type  text not null default 'wholesale',
  kind        text not null check (kind in ('spike_risk', 'price_above', 'price_below')),
  threshold   numeric(12, 4) not null check (threshold > 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  check (item_key is not null or kind = 'spike_risk')
);
create index alert_rules_user on alert_rules (user_id);

-- One event per rule per forecast data date, so an owner is told once, not on every 30-minute run.
create table alert_events (
  id          bigserial primary key,
  rule_id     bigint not null references alert_rules (id) on delete cascade,
  run_id      bigint not null references forecast_runs (id) on delete cascade,
  data_date   date not null,
  item_key    text not null,
  message     text not null,
  emailed     boolean not null default false,
  email_id    text,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (rule_id, data_date, item_key)
);
create index alert_events_rule on alert_events (rule_id, created_at desc);
