"""Score live forecasts against the real price once their 7-day target has a CBSL report."""

from __future__ import annotations

import psycopg

SPIKE_RATIO = 1.25

SCORE_SQL = """
insert into forecast_scores (run_id, item_key, market, price_type, base_date, target_date, actual_date,
                             actual_price, inside_80, abs_pct_error, spiked, warned)
select f.run_id, f.item_key, f.market, f.price_type, f.base_date, f.target_date, a.obs_date, a.price,
       a.price between f.q10 and f.q90,
       abs(a.price / f.q50 - 1),
       a.price >= f.base_price * %(spike)s,
       f.signal = 'spike'
from forecasts f
join lateral (
  -- the last report on or before the target date, and at least 5 days after the base date
  select p.obs_date, p.price from prices p
  where p.item_key = f.item_key and p.market = f.market and p.price_type = f.price_type
    and p.obs_date <= f.target_date and p.obs_date >= f.base_date + 5
  order by p.obs_date desc limit 1
) a on true
where f.signal <> 'no_forecast' and f.q50 is not null
  and f.target_date <= (select max(obs_date) from prices)
  and not exists (select 1 from forecast_scores s where s.run_id = f.run_id and s.item_key = f.item_key
                  and s.market = f.market and s.price_type = f.price_type)
"""


def score_forecasts(conn: psycopg.Connection) -> int:
    """Score every forecast whose target date has passed and has a report. Returns rows added."""
    with conn.cursor() as cur:
        cur.execute(SCORE_SQL, {"spike": SPIKE_RATIO})
        n = cur.rowcount
    conn.commit()
    return max(n, 0)


def live_summary(conn: psycopg.Connection) -> dict:
    row = conn.execute("""
        select count(*), avg(inside_80::int), avg(abs_pct_error),
               sum((warned and spiked)::int), sum(warned::int), sum(spiked::int), min(base_date), max(base_date)
        from live_scores""").fetchone()
    n, cov, mae, tp, warned, spiked, first, last = row
    return {"scored": n, "coverage80": cov, "mean_abs_pct_error": mae,
            "spike_precision": (tp / warned) if warned else None, "spike_recall": (tp / spiked) if spiked else None,
            "first_base_date": first, "last_base_date": last}
