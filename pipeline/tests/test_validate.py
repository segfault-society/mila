from datetime import date

from mila.cbsl.parse import Observation, ParsedReport
from mila.cbsl.validate import validate

D = date(2026, 11, 9)
BASKET = ["beans", "carrot", "cabbage", "tomato", "brinjal", "pumpkin", "snake_gourd", "green_chilli", "lime"]


def obs(item, today, comparison=None, market="pettah", unit="kg"):
    return Observation(item, item, unit, market, "wholesale", today, comparison, "prev_day", None)


def report(*extra, date_=D):
    return ParsedReport(report_date=date_, observations=[obs(k, 100.0, 100.0) for k in BASKET] + list(extra))


def test_accepts_clean_report_and_keeps_echoes():
    v = validate(report(), D, {})
    assert v.status == "parsed"
    assert v.prices[("beans", "pettah", "wholesale")] == 100.0
    assert v.echoes[("beans", "pettah", "wholesale")] == (100.0, None)


def test_rejects_threefold_jump_against_recent_price_only():
    last = {("beans", "pettah", "wholesale"): (date(2026, 11, 6), 20.0)}
    v = validate(report(), D, last)
    assert ("beans", "pettah", "wholesale") not in v.prices
    assert any(i.rule == "jump" and i.severity == "error" for i in v.issues)
    stale = {("beans", "pettah", "wholesale"): (date(2025, 1, 1), 20.0)}
    assert ("beans", "pettah", "wholesale") in validate(report(), D, stale).prices


def test_date_mismatch_sends_report_to_review():
    v = validate(report(date_=date(2026, 11, 6)), D, {})
    assert v.status == "review" and not v.prices


def test_too_few_basket_prices_goes_to_review():
    v = validate(ParsedReport(report_date=D, observations=[obs("beans", 100.0)]), D, {})
    assert v.status == "review" and not v.prices


def test_wrong_unit_and_out_of_range_are_dropped():
    v = validate(report(obs("coconut_oil", 800.0, unit="kg"), obs("sugar_white", 99999.0)), D, {})
    assert ("coconut_oil", "pettah", "wholesale") not in v.prices
    assert ("sugar_white", "pettah", "wholesale") not in v.prices


def test_all_na_duplicate_is_not_a_conflict():
    v = validate(report(obs("beans", None, None)), D, {})
    assert v.prices[("beans", "pettah", "wholesale")] == 100.0
    assert not any(i.rule == "duplicate_conflict" for i in v.issues)
