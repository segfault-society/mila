"""The twice-weekly SMS digest: at most five lines, ordered by what needs action, plain ASCII (GSM-7)."""

from __future__ import annotations

import html as _html
import os
from dataclasses import dataclass
from datetime import date

import psycopg

from mila.items import ITEMS_BY_KEY

ORDER = {"spike": 0, "rise": 1, "no_forecast": 2, "fall": 3, "steady": 4}
STORABLE = {"red_onion_local", "red_onion_imp", "big_onion_local", "big_onion_imp", "potato_local", "potato_imp",
            "dried_chilli_imp", "red_dhal", "sugar_white", "samba", "nadu", "kekulu_white", "kekulu_red",
            "coconut_oil"}
MAX_LINES = 5


@dataclass
class Line:
    item_key: str
    signal: str
    base_price: float
    base_date: date
    q10: float | None
    q50: float | None
    q90: float | None
    spike_prob: float | None
    reason: str | None
    drivers: list[str]


def _rs(x: float) -> str:
    return f"Rs {x:,.0f}"


def _d(d: date) -> str:
    return f"{d.day} {d:%b}"


def _why(line: Line) -> str:
    """The first reason that points the same way as the signal (a rebound after a drop is said as such)."""
    for d in line.drivers:
        low = d.lower()
        if "down" in low and "over the last week" in low:
            return d.replace("already down", "fell") + ", and prices usually recover after a drop like that"
        if any(w in low for w in ("below normal", "below its", "pulling the forecast down")):
            continue
        return d
    return ""


def _action(line: Line, subs: list[str]) -> str:
    storable = line.item_key in STORABLE
    if line.signal == "spike":
        return "Storable: buy 2 weeks' stock now." if storable else (
            f"Swap on the menu: {', '.join(subs[:2])}." if subs else "Buy only what you need.")
    if line.signal == "rise":
        return "Storable: buy ahead now." if storable else "Buy early in the week."
    if line.signal == "fall":
        return "Wait if you can." if storable else "Buy as needed."
    return "Buy as needed."


def render(name: str, market: str, price_type: str, data_date: date, lines: list[Line],
           packet_today: float | None, packet_next: tuple[float, float, float] | None, today: date) -> str:
    lines = sorted(lines, key=lambda x: (ORDER[x.signal], -(x.spike_prob or 0)))
    steady_veg = [ITEMS_BY_KEY[x.item_key].name.lower() for x in lines
                  if x.signal in ("steady", "fall") and ITEMS_BY_KEY[x.item_key].category == "vegetable"]
    out = [f"Mila {today:%a} {_d(today)} - {name}",
           f"CBSL prices to {_d(data_date)}, {market.capitalize()} {price_type}"]
    for x in lines[:MAX_LINES]:
        n = ITEMS_BY_KEY[x.item_key].name.upper()
        if x.signal == "no_forecast":
            out.append(f"? {n}: no forecast this week ({x.reason}). Last verified {_rs(x.base_price)} "
                       f"({_d(x.base_date)}).")
            continue
        head = {"spike": "SPIKE RISK", "rise": "rise likely", "fall": "falling", "steady": "steady"}[x.signal]
        rng = f"{_rs(x.q10)}-{x.q90:,.0f}" if x.q10 and x.q90 else ""
        reason = _why(x) if x.signal in ("spike", "rise") else ""
        why = f" Why: {reason}." if reason else ""
        chance = f" Spike chance {x.spike_prob * 100:.0f}%." if x.signal == "spike" and x.spike_prob else ""
        out.append(f"{'!' if x.signal == 'spike' else '-'} {n} {head}: now {_rs(x.base_price)}, "
                   f"likely {rng} next week.{chance}{why} {_action(x, steady_veg)}")
    hidden = len(lines) - MAX_LINES
    if hidden > 0:
        out.append(f"+{hidden} more items steady. Details: link in your welcome SMS.")
    if packet_today and packet_next:
        lo, mid, hi = packet_next
        out.append(f"Your basket per day: {_rs(packet_today)} today, ~{_rs(mid)} next week "
                   f"({lo:,.0f}-{hi:,.0f}).")
    out.append("Reply STOP to unsubscribe")
    return "\n".join(out)


def build_digest(conn: psycopg.Connection, subscriber_id: int, today: date) -> tuple[int, str]:
    sub = conn.execute("select name, market, price_type, basket from subscribers where id = %s",
                       (subscriber_id,)).fetchone()
    name, market, ptype, basket = sub
    run_id, data_date = conn.execute("select id, data_date from forecast_runs order by id desc limit 1").fetchone()
    rows = conn.execute(
        """select item_key, signal, base_price::float, base_date, q10::float, q50::float, q90::float, spike_prob,
                  abstain_reason, drivers
           from forecasts where run_id = %s and market = %s and price_type = %s and item_key = any(%s)""",
        (run_id, market, ptype, list(basket))).fetchall()
    lines = [Line(*r) for r in rows]
    packet_today = sum(basket[x.item_key] * x.base_price for x in lines) or None
    have = [x for x in lines if x.q50 is not None]
    packet_next = None
    if have:  # items without a forecast are counted at today's price
        packet_next = tuple(sum(basket[x.item_key] * (getattr(x, q) if x.q50 is not None else x.base_price)
                                for x in lines) for q in ("q10", "q50", "q90"))
    return run_id, render(name, market, ptype, data_date, lines, packet_today, packet_next, today)


APP_URL = os.environ.get("MILA_APP_URL", "https://mila-taprona.vercel.app")
TONE = {"spike": "#c2410c", "rise": "#b45309", "steady": "#15803d", "fall": "#1d4ed8", "no_forecast": "#6b7280"}
HEAD = {"spike": "Spike risk", "rise": "Rise likely", "steady": "Steady", "fall": "Falling", "no_forecast": "No forecast"}


def subject_for(lines: list[Line], market: str, price_type: str) -> str:
    spikes = sum(x.signal == "spike" for x in lines)
    rises = sum(x.signal == "rise" for x in lines)
    where = f"{market.capitalize()} {price_type}"
    if spikes:
        return f"Mila: {spikes} spike risk{'s' if spikes > 1 else ''} in your basket next week ({where})"
    if rises:
        return f"Mila: {rises} item{'s' if rises > 1 else ''} likely to rise next week ({where})"
    return f"Mila: your basket looks steady next week ({where})"


def render_html(name: str, market: str, price_type: str, data_date: date, lines: list[Line],
                packet_today: float | None, packet_next: tuple[float, float, float] | None, today: date) -> str:
    """The same digest as an email: a table of the basket, most urgent first, plus the basket cost."""
    e = _html.escape
    lines = sorted(lines, key=lambda x: (ORDER[x.signal], -(x.spike_prob or 0)))
    rows = []
    for x in lines:
        item = ITEMS_BY_KEY[x.item_key].name
        if x.signal == "no_forecast":
            nxt = f"No forecast ({e(x.reason or '')})"
        else:
            nxt = f"{_rs(x.q50)} <span style='color:#6b7280'>({x.q10:,.0f}&ndash;{x.q90:,.0f})</span>"
        chance = f"{x.spike_prob * 100:.0f}%" if x.spike_prob is not None and x.signal != "no_forecast" else ""
        rows.append(
            f"<tr><td style='padding:8px 10px;border-top:1px solid #e5e7eb'><b>{e(item)}</b></td>"
            f"<td style='padding:8px 10px;border-top:1px solid #e5e7eb;color:{TONE[x.signal]};white-space:nowrap'>"
            f"{HEAD[x.signal]}</td>"
            f"<td style='padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right'>{_rs(x.base_price)}</td>"
            f"<td style='padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right'>{nxt}</td>"
            f"<td style='padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right'>{chance}</td></tr>")
    why = [x for x in lines if x.signal in ("spike", "rise") and x.drivers][:3]
    why_html = "".join(f"<li><b>{e(ITEMS_BY_KEY[x.item_key].name)}:</b> {e(_why(x) or x.drivers[0])}</li>" for x in why)
    cost = ""
    if packet_today and packet_next:
        lo, mid, hi = packet_next
        cost = (f"<p style='font-size:15px'>Your basket per day: <b>{_rs(packet_today)}</b> today, about "
                f"<b>{_rs(mid)}</b> next week (likely {lo:,.0f}&ndash;{hi:,.0f}).</p>")
    return f"""<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;color:#111827">
<p style="font-size:20px;font-weight:600;margin:0 0 4px">Mila</p>
<p style="color:#6b7280;margin:0 0 20px">Next week for {e(name)} &middot; CBSL prices to {_d(data_date)}, {e(market.capitalize())} {e(price_type)}</p>
{cost}
<table style="width:100%;border-collapse:collapse;font-size:14px">
<tr style="color:#6b7280;text-align:left"><th style="padding:6px 10px">Item</th><th style="padding:6px 10px">Next 7 days</th>
<th style="padding:6px 10px;text-align:right">Now</th><th style="padding:6px 10px;text-align:right">Next week</th>
<th style="padding:6px 10px;text-align:right">Spike chance</th></tr>
{''.join(rows)}
</table>
{f"<p style='margin-top:20px;font-weight:600'>Why</p><ul>{why_html}</ul>" if why_html else ""}
<p style="margin-top:24px"><a href="{APP_URL}/app/kitchen" style="background:#111827;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open my kitchen</a></p>
<p style="color:#6b7280;font-size:12px;margin-top:28px">Prices: Central Bank of Sri Lanka Daily Price Report. Weather: Open-Meteo (CC BY 4.0).
Forecasts are estimates, not advice. You get this because you set up a kitchen on Mila; delete it any time from your account.</p>
</div>"""


def build_digest_email(conn: psycopg.Connection, subscriber_id: int, today: date) -> tuple[int, str, str, str]:
    """(run_id, subject, text, html) for one subscriber."""
    run_id, text = build_digest(conn, subscriber_id, today)
    name, market, ptype, basket = conn.execute(
        "select name, market, price_type, basket from subscribers where id = %s", (subscriber_id,)).fetchone()
    data_date = conn.execute("select data_date from forecast_runs where id = %s", (run_id,)).fetchone()[0]
    rows = conn.execute(
        """select item_key, signal, base_price::float, base_date, q10::float, q50::float, q90::float, spike_prob,
                  abstain_reason, drivers
           from forecasts where run_id = %s and market = %s and price_type = %s and item_key = any(%s)""",
        (run_id, market, ptype, list(basket))).fetchall()
    lines = [Line(*r) for r in rows]
    packet_today = sum(basket[x.item_key] * x.base_price for x in lines) or None
    packet_next = None
    if any(x.q50 is not None for x in lines):
        packet_next = tuple(sum(basket[x.item_key] * (getattr(x, q) if x.q50 is not None else x.base_price)
                                for x in lines) for q in ("q10", "q50", "q90"))
    html = render_html(name, market, ptype, data_date, lines, packet_today, packet_next, today)
    return run_id, subject_for(lines, market, ptype), text, html
