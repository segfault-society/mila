"""The validation gate: nothing reaches the prices table without passing these rules."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from mila.cbsl.parse import Observation, ParsedReport
from mila.items import ITEMS_BY_KEY

PRICE_MIN, PRICE_MAX = 1.0, 50_000.0
JUMP_REJECT = 3.0  # a day-over-day move of 3x (or 1/3) is held back as a probable typo
JUMP_WARN = 1.8
MIN_BASKET_OBS = 8  # fewer basket prices than this and the whole report goes to review

Series = tuple[str, str, str]  # item_key, market, price_type


@dataclass
class Issue:
    severity: str  # error | warning
    rule: str
    detail: dict


@dataclass
class Validated:
    status: str  # parsed | review
    prices: dict[Series, float] = field(default_factory=dict)
    echoes: dict[Series, tuple[float, date | None]] = field(default_factory=dict)
    issues: list[Issue] = field(default_factory=list)


def _series(o: Observation) -> Series:
    return (o.item_key, o.market, o.price_type)


RECENT_DAYS = 10  # the jump rule only compares against a price this recent


def validate(report: ParsedReport, index_date: date, last_price: dict[Series, tuple[date, float]]) -> Validated:
    """Check a parsed report. `last_price` holds the latest accepted (date, price) per series before it."""
    out = Validated(status="parsed")
    issues = out.issues

    if report.report_date and report.report_date != index_date:
        issues.append(Issue("error", "date_mismatch",
                            {"title_date": report.report_date.isoformat(), "listing_date": index_date.isoformat()}))
        out.status = "review"
        return out

    for name in sorted(set(report.skipped_rows)):
        issues.append(Issue("warning", "unknown_item", {"label": name}))

    seen: dict[Series, Observation] = {}
    for o in report.observations:
        if o.today is None and o.comparison is None:
            continue  # "n.a." in both cells: nothing to store, and not a conflict with a real row
        item = ITEMS_BY_KEY[o.item_key]
        s = _series(o)
        if o.unit and o.unit != item.unit:
            issues.append(Issue("error", "unit", {"series": s, "unit": o.unit, "expected": item.unit}))
            continue
        if s in seen:
            prev = seen[s]
            if (prev.today, prev.comparison) != (o.today, o.comparison):
                issues.append(Issue("error", "duplicate_conflict",
                                    {"series": s, "a": [prev.today, prev.comparison], "b": [o.today, o.comparison]}))
                out.prices.pop(s, None)
                out.echoes.pop(s, None)
            continue
        seen[s] = o
        for value, kind in ((o.today, "today"), (o.comparison, "comparison")):
            if value is not None and not PRICE_MIN <= value <= PRICE_MAX:
                issues.append(Issue("error", "range", {"series": s, kind: value}))
        if o.today is not None and PRICE_MIN <= o.today <= PRICE_MAX:
            ref_date, ref = last_price.get(s, (None, None))
            if ref_date is None or (index_date - ref_date).days > RECENT_DAYS or ref_date >= index_date:
                ref = None
            ratio = o.today / ref if ref else 1.0
            if ratio > JUMP_REJECT or ratio < 1 / JUMP_REJECT:
                issues.append(Issue("error", "jump", {"series": s, "today": o.today, "previous": ref}))
            else:
                if ratio > JUMP_WARN or ratio < 1 / JUMP_WARN:
                    issues.append(Issue("warning", "jump", {"series": s, "today": o.today, "previous": ref}))
                out.prices[s] = o.today
        if (o.comparison is not None and o.comparison_kind == "prev_day"
                and PRICE_MIN <= o.comparison <= PRICE_MAX):
            out.echoes[s] = (o.comparison, o.comparison_date)

    basket = sum(1 for (k, _, _) in out.prices if ITEMS_BY_KEY[k].basket)
    if basket < MIN_BASKET_OBS:
        issues.append(Issue("error", "coverage", {"basket_prices": basket, "minimum": MIN_BASKET_OBS}))
        out.status = "review"
        out.prices.clear()
        out.echoes.clear()
    return out
