-- Live track record: every forecast is scored against the real price once its target date has a report.
create table forecast_scores (
  run_id        bigint not null references forecast_runs (id) on delete cascade,
  item_key      text not null,
  market        text not null,
  price_type    text not null,
  base_date     date not null,
  target_date   date not null,
  actual_date   date not null,
  actual_price  numeric(10, 2) not null,
  inside_80     boolean not null,
  abs_pct_error real not null,
  spiked        boolean not null,  -- the real price rose 25%+ over the base price
  warned        boolean not null,  -- Mila said "spike"
  scored_at     timestamptz not null default now(),
  primary key (run_id, item_key, market, price_type)
);

-- One score per series and base date: the latest run made from that day's prices.
create view live_scores as
select distinct on (s.item_key, s.market, s.price_type, s.base_date) s.*
from forecast_scores s
order by s.item_key, s.market, s.price_type, s.base_date, s.run_id desc;
