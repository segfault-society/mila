"""The twice-weekly SMS digest: at most five lines, ordered by what needs action, plain ASCII (GSM-7)."""

from __future__ import annotations

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
        head = {"spike": "SPIKE LIKELY", "rise": "rise likely", "fall": "falling", "steady": "steady"}[x.signal]
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
