"""Layout-aware parser for CBSL Daily Price Report PDFs (all eras, 2016 onwards).

CBSL changed the layout several times (one page per category in 2016-19, "Yesterday" columns in 2020, a
single table with "Last Friday" columns since 2021). Instead of one parser per era, every page is read the
same way:

1. words -> rows by vertical position; split first digits ("5" + "00.00") are glued back together;
2. value columns are found by clustering the x-centres of numbers on item rows; they come in pairs
   (comparison column, today column);
3. each pair is labelled with a market and wholesale/retail from the header rows above it: by order when
   a header row has one label per pair, otherwise by nearest centre;
4. item rows are matched to canonical items; values are assigned to the nearest column.

The parser never guesses: anything it cannot place raises ParseError, and the validation gate checks
the result before it reaches the database.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

import pdfplumber

from mila.items import FISH_NAMES, item_key_for, market_key_for, normalise_name, unit_for

NUM = re.compile(r"^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$")
FRAG = re.compile(r"^[\d,.]+$")
NA = {"n.a.", "n.a", "na", "-", "n/a"}
_WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday")
COMPARISON_WORDS = {"previous": "prev5_avg", "yesterday": "prev_day", **{d: "prev_day" for d in _WEEKDAYS}}
SECTION_WORDS = {"VEGETABLES": "vegetable", "OTHER": "other", "OTHERS": "other", "FRUITS": "fruit",
                 "RICE": "rice", "FISH": "fish"}
PRICE_TYPES = {"wholesale": "wholesale", "retail": "retail"}
ROW_TOL = 4.0  # points; rows in every era are >= 8 pt apart
COL_GAP = 14.0  # a gap this wide between number centres starts a new column
MAX_COL_DIST = 16.0


class ParseError(ValueError):
    pass


@dataclass
class Word:
    text: str
    x0: float
    x1: float
    top: float

    @property
    def xc(self) -> float:
        return (self.x0 + self.x1) / 2


@dataclass
class Pair:
    comp_x: float
    today_x: float
    market: str | None = None
    price_type: str | None = None

    @property
    def xc(self) -> float:
        return (self.comp_x + self.today_x) / 2


@dataclass
class Observation:
    item_raw: str
    item_key: str
    unit: str | None
    market: str
    price_type: str
    today: float | None
    comparison: float | None
    comparison_kind: str
    comparison_date: date | None


@dataclass
class ParsedReport:
    report_date: date | None  # from the PDF title, None when the title has no date (2016-17)
    observations: list[Observation] = field(default_factory=list)
    skipped_rows: list[str] = field(default_factory=list)  # item labels we could not map
    pages_parsed: list[int] = field(default_factory=list)


def _glue(words: list[Word]) -> list[Word]:
    """Re-join numbers that the PDF draws in two pieces ('5' + '00.00', '1' + ',000.00')."""
    out: list[Word] = []
    for w in sorted(words, key=lambda w: w.x0):
        prev = out[-1] if out else None
        if (prev and FRAG.match(prev.text) and FRAG.match(w.text) and len(prev.text) <= 2
                and "." not in prev.text and w.x0 - prev.x1 < 3.0):
            out[-1] = Word(prev.text + w.text, prev.x0, max(prev.x1, w.x1), min(prev.top, w.top))
        else:
            out.append(w)
    return out


def _rows(words: Iterable[Word]) -> list[list[Word]]:
    rows: list[list[Word]] = []
    for w in sorted(words, key=lambda w: w.top):
        if rows and w.top - rows[-1][0].top <= ROW_TOL:
            rows[-1].append(w)
        else:
            rows.append([w])
    return [_glue(r) for r in rows]


def _is_value(text: str) -> bool:
    return bool(NUM.match(text)) or text.lower() in NA


def _to_float(text: str) -> float | None:
    if text.lower() in NA:
        return None
    return float(text.replace(",", ""))


def _cluster(xs: list[float]) -> list[float]:
    xs = sorted(xs)
    groups: list[list[float]] = []
    for x in xs:
        if groups and x - groups[-1][-1] <= COL_GAP:
            groups[-1].append(x)
        else:
            groups.append([x])
    # ignore stray clusters (e.g. a footnote number) that appear on very few rows
    big = max(len(g) for g in groups)
    return [sum(g) / len(g) for g in groups if len(g) >= max(2, big * 0.25)]


def _assign(labels: list[tuple[str, float]], groups: list[Pair], attr: str, centre) -> None:
    """One label per group -> by order; fewer (spanning) labels -> nearest centre."""
    if len(labels) == len(groups):
        for (val, _), p in zip(sorted(labels, key=lambda t: t[1]), groups, strict=True):
            setattr(p, attr, val)
        return
    for p in groups:
        val, _ = min(labels, key=lambda t: abs(t[1] - centre(p)))
        setattr(p, attr, val)


_TITLE_DATE_PATTERNS = [
    (re.compile(r"(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})"), lambda m: datetime.strptime(
        f"{m[1]} {m[2][:3]} {m[3]}", "%d %b %Y").date()),
    (re.compile(r"(\d{4})[/-](\d{2})[/-](\d{2})"), lambda m: date(int(m[1]), int(m[2]), int(m[3]))),
]


def _title_date(text: str) -> date | None:
    compact = re.sub(r"(?<=\d) (?=\d)", "", text)  # "2 0 1 9 - 0 4" -> "2019 - 04"
    compact = re.sub(r"\s*([/-])\s*", r"\1", compact)
    for scope in (compact.split("Commodities", 1)[-1], compact):
        for pat, conv in _TITLE_DATE_PATTERNS:
            m = pat.search(scope)
            if m:
                try:
                    return conv(m)
                except ValueError:
                    continue
    return None


def _split_name_unit(labels: list[Word]) -> tuple[str, str | None]:
    """'Coconut (Rs./Nut)' or 'Beans' + 'Rs./kg' -> ('Coconut', 'nut')."""
    text = " ".join(w.text for w in labels)
    unit = None
    m = re.search(r"\(?\s*(Rs\.?\s*/\s*[A-Za-z]+)\s*\)?", text)
    if m:
        unit = unit_for(m.group(1))
        text = (text[:m.start()] + text[m.end():])
    return " ".join(text.split()), unit


def _comparison_date(rows: list[list[Word]]) -> date | None:
    for row in rows:
        for w in row:
            m = re.fullmatch(r"(\d{2})\.(\d{2})\.(\d{4})", w.text)
            if m:
                return date(int(m[3]), int(m[2]), int(m[1]))
    return None


def parse_page(page_words: list[Word]) -> tuple[list[Observation], list[str], date | None] | None:
    """Parse one page. Returns None if the page has no price table (e.g. the chart page)."""
    rows = _rows(page_words)
    # header: the first row holding a comparison label (Previous / Yesterday / Last <weekday>)
    sub_idx = None
    for i, row in enumerate(rows):
        if any(w.text.lower() in COMPARISON_WORDS for w in row):
            sub_idx = i
            break
    if sub_idx is None:
        return None
    # the comparison and "Today" labels can sit on two or three stacked rows; gather the header band
    band = [w for row in rows[sub_idx:sub_idx + 3] for w in row]
    n_today = sum(w.text.lower() == "today" for w in band)
    n_prev = sum(w.text.lower() == "previous" for w in band)
    n_prev_day = sum(COMPARISON_WORDS.get(w.text.lower()) == "prev_day" for w in band)
    n_groups = n_today or n_prev or n_prev_day
    if not n_groups:
        return None

    # item rows (known items only) define the value columns; numbers are right-aligned, so cluster x1
    item_rows: list[list[Word]] = []
    for row in rows[sub_idx + 1:]:
        values = [w for w in row if _is_value(w.text)]
        if len(values) < 2:
            continue
        labels = [w for w in row if not _is_value(w.text) and w.x1 < min(v.x0 for v in values)]
        name, _ = _split_name_unit(labels)
        if name and item_key_for(name):
            item_rows.append(values)
    if not item_rows:
        return None
    first_value_x = min(v.x0 for vals in item_rows for v in vals)
    col_xs = _cluster([v.x1 for vals in item_rows for v in vals])
    if len(col_xs) % n_groups:
        raise ParseError(f"{len(col_xs)} value columns do not split into {n_groups} groups: "
                         f"{[round(x) for x in col_xs]}")
    g = len(col_xs) // n_groups
    if g not in (2, 3):
        raise ParseError(f"unexpected group size {g} ({len(col_xs)} columns, {n_groups} groups)")
    # group columns: (prev-week avg,) comparison, today
    groups = [Pair(col_xs[i + g - 2], col_xs[i + g - 1]) for i in range(0, len(col_xs), g)]
    if g == 3:
        comp_kind = "prev_day"
    else:
        comp_kind = "prev5_avg" if n_prev and not n_prev_day else "prev_day"
    group_span = {id(p): (col_xs[i * g] - 25, col_xs[i * g + g - 1]) for i, p in enumerate(groups)}

    def centre(p: Pair) -> float:
        lo, hi = group_span[id(p)]
        return (lo + hi) / 2

    header_rows = rows[:sub_idx + 1]
    for row in header_rows:
        markets = [(market_key_for(w.text), w.xc) for w in row if market_key_for(w.text)]
        types = [(PRICE_TYPES[w.text.lower()], w.xc) for w in row if w.text.lower() in PRICE_TYPES]
        if markets:
            _assign(markets, groups, "market", centre)
        if types:
            _assign(types, groups, "price_type", centre)
    if any(p.market is None or p.price_type is None for p in groups):
        raise ParseError(f"unlabelled column groups: {groups}")

    comp_date = _comparison_date(rows[:sub_idx + 3])
    observations: list[Observation] = []
    skipped: list[str] = []
    overrides: dict[int, str] = {}
    section = None
    for row in rows[sub_idx + 1:]:
        texts = [w.text for w in row]
        joined = "".join(texts).upper()
        if joined in SECTION_WORDS and all(len(t) <= 9 for t in texts):
            section = SECTION_WORDS[joined]
            overrides = {}
            continue
        values = [w for w in row if _is_value(w.text)]
        if not values:
            # a row of only market names inside the table re-labels the group under it (rice: Marandagahamula)
            mk = [(market_key_for(w.text), w.xc) for w in row if market_key_for(w.text)]
            if mk and len(mk) == len(row):
                for m, x in mk:
                    idx = min(range(len(groups)), key=lambda i: abs(centre(groups[i]) - x))
                    overrides[idx] = m
            continue
        if section == "fish":
            continue
        labels = [w for w in row if not _is_value(w.text) and w.x1 < first_value_x + 1]
        name, unit = _split_name_unit(labels)
        if not name:
            continue
        key = item_key_for(name)
        if key is None:
            if len(values) >= 4 and re.search(r"[A-Za-z]{3}", name):
                skipped.append(name)
            continue
        if key.startswith("fish:") or normalise_name(name).split()[0] in FISH_NAMES:
            continue
        cells: dict[float, float | None] = {}
        for v in values:
            cx = min(col_xs, key=lambda c: abs(c - v.x1))
            if abs(cx - v.x1) > MAX_COL_DIST:
                raise ParseError(f"{name}: value {v.text} at x1={v.x1:.0f} fits no column")
            if cx in cells:
                raise ParseError(f"{name}: two values in column x1={cx:.0f}")
            cells[cx] = _to_float(v.text)
        for idx, p in enumerate(groups):
            if p.comp_x not in cells and p.today_x not in cells:
                continue
            observations.append(Observation(
                item_raw=name, item_key=key, unit=unit,
                market=overrides.get(idx, p.market), price_type=p.price_type,
                today=cells.get(p.today_x), comparison=cells.get(p.comp_x),
                comparison_kind=comp_kind, comparison_date=comp_date,
            ))
    return observations, skipped, comp_date


def _page_words(page) -> list[Word]:
    return [Word(w["text"], w["x0"], w["x1"], w["top"])
            for w in page.extract_words(x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False)]


def parse_pdf(path: Path) -> ParsedReport:
    with pdfplumber.open(path) as pdf:
        report = ParsedReport(report_date=None)
        for i, page in enumerate(pdf.pages):
            words = _page_words(page)
            title = " ".join(w.text for w in sorted(words, key=lambda w: (round(w.top), w.x0))[:40])
            if "Retail" not in title and "Wholesale" not in title:
                continue
            if report.report_date is None:
                report.report_date = _title_date(title)
            result = parse_page(words)
            if result is None:
                continue
            obs, skipped, _ = result
            report.observations.extend(obs)
            report.skipped_rows.extend(skipped)
            report.pages_parsed.append(i + 1)
    if not report.observations:
        raise ParseError("no price table found")
    return report
