"""Price alerts: check each owner's rules against the latest forecast run, record events, email them once."""

from __future__ import annotations

import html as _html
import logging
from dataclasses import dataclass
from datetime import date

import psycopg

from mila.emailer import email_enabled, send_email
from mila.items import ITEMS_BY_KEY

log = logging.getLogger(__name__)


@dataclass
class Hit:
    rule_id: int
    user_id: str
    item_key: str
    message: str


def _fmt_rs(x: float) -> str:
    return f"Rs {x:,.0f}"


def find_hits(conn: psycopg.Connection, run_id: int) -> list[Hit]:
    """Every active rule that the run's forecasts trip. 'Any item' spike rules use the owner's kitchen basket."""
    rows = conn.execute(
        """
        select r.id, r.user_id, f.item_key, r.kind, r.threshold::float, f.signal, f.spike_prob,
               f.base_price::float, f.q50::float, f.target_date, f.market, f.price_type
        from alert_rules r
        join forecasts f on f.run_id = %(run)s and f.market = r.market and f.price_type = r.price_type
        left join subscribers s on s.user_id = r.user_id and s.active
        where r.active and f.signal <> 'no_forecast'
          and (r.item_key = f.item_key or (r.item_key is null and s.basket ? f.item_key))
        """, {"run": run_id}).fetchall()
    hits = []
    for rid, uid, item, kind, thr, _signal, prob, base, q50, target, market, ptype in rows:
        name = ITEMS_BY_KEY[item].name if item in ITEMS_BY_KEY else item
        where = f"{market.capitalize()} {ptype}"
        by = f"{target.day} {target:%b}"
        if kind == "spike_risk" and prob is not None and prob >= thr:
            msg = (f"{name}: spike risk {prob * 100:.0f}% by {by} at {where} "
                   f"(now {_fmt_rs(base)}, likely about {_fmt_rs(q50)}).")
        elif kind == "price_above" and q50 is not None and q50 > thr:
            msg = f"{name}: likely about {_fmt_rs(q50)} by {by} at {where}, above your {_fmt_rs(thr)} limit (now {_fmt_rs(base)})."
        elif kind == "price_below" and q50 is not None and q50 < thr:
            msg = f"{name}: likely about {_fmt_rs(q50)} by {by} at {where}, below your {_fmt_rs(thr)} mark (now {_fmt_rs(base)})."
        else:
            continue
        hits.append(Hit(rid, uid, item, msg))
    return hits


def run_alerts(conn: psycopg.Connection, run_id: int | None = None, send: bool = True) -> dict[str, int]:
    """Record new alert events for the run (once per rule, data date and item) and email each owner a summary."""
    if run_id is None:
        row = conn.execute("select id from forecast_runs order by id desc limit 1").fetchone()
        if not row:
            return {"new": 0, "emailed": 0}
        run_id = row[0]
    data_date: date = conn.execute("select data_date from forecast_runs where id = %s", (run_id,)).fetchone()[0]
    new_by_user: dict[str, list[tuple[int, str]]] = {}
    with conn.cursor() as cur:
        for h in find_hits(conn, run_id):
            cur.execute(
                """insert into alert_events (rule_id, run_id, data_date, item_key, message)
                   values (%s, %s, %s, %s, %s) on conflict (rule_id, data_date, item_key) do nothing
                   returning id""", (h.rule_id, run_id, data_date, h.item_key, h.message))
            got = cur.fetchone()
            if got:
                new_by_user.setdefault(h.user_id, []).append((got[0], h.message))
    conn.commit()

    emailed = 0
    if send and email_enabled():
        for user_id, events in new_by_user.items():
            row = conn.execute("select email, name from subscribers where user_id = %s and active and email is not null",
                               (user_id,)).fetchone()
            if not row:
                continue
            email, kitchen = row
            subject = (f"Mila alert: {events[0][1].split(':')[0]}" if len(events) == 1
                       else f"Mila alert: {len(events)} items crossed your limits")
            text = "\n".join(m for _, m in events) + "\n\nOpen Mila: https://mila-taprona.vercel.app/app/alerts"
            items = "".join(f"<li style='margin:6px 0'>{_html.escape(m)}</li>" for _, m in events)
            html = (f"<div style='font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;color:#111827'>"
                    f"<p style='font-size:20px;font-weight:600;margin:0 0 4px'>Mila</p>"
                    f"<p style='color:#6b7280;margin:0 0 16px'>Price alert for {_html.escape(kitchen)} &middot; "
                    f"CBSL prices to {data_date.day} {data_date:%b}</p><ul style='padding-left:18px'>{items}</ul>"
                    f"<p style='margin-top:20px'><a href='https://mila-taprona.vercel.app/app/alerts' "
                    f"style='background:#111827;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none'>"
                    f"Manage alerts</a></p><p style='color:#6b7280;font-size:12px;margin-top:24px'>Forecasts are "
                    f"estimates, not advice. Prices: Central Bank of Sri Lanka; weather: Open-Meteo (CC BY 4.0).</p></div>")
            try:
                eid = send_email(email, subject, text, html)
            except Exception as exc:  # keep the events; the in-app list still shows them
                log.warning("alert email failed for a kitchen: %s", exc)
                continue
            ids = [i for i, _ in events]
            conn.execute("update alert_events set emailed = true, email_id = %s where id = any(%s)", (eid, ids))
            conn.commit()
            emailed += 1
    return {"new": sum(len(v) for v in new_by_user.values()), "emailed": emailed}
