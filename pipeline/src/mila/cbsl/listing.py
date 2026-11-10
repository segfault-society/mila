"""Parse the CBSL Daily Price Report listing pages into report links."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from mila.config import CBSL_BASE

_TITLE_DATE = re.compile(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})")
_FILE_DATE = re.compile(r"(20\d{2})(\d{2})(\d{2})")


@dataclass(frozen=True)
class ReportLink:
    url: str
    report_date: date | None
    title: str


def _date_from_title(title: str) -> date | None:
    m = _TITLE_DATE.search(title)
    if not m:
        return None
    for fmt in ("%d %B %Y", "%d %b %Y"):
        try:
            return datetime.strptime(" ".join(m.groups()), fmt).date()
        except ValueError:
            continue
    return None


def _date_from_url(url: str) -> date | None:
    name = url.rsplit("/", 1)[-1]
    m = _FILE_DATE.search(name)
    if not m:
        return None
    try:
        return date(int(m[1]), int(m[2]), int(m[3]))
    except ValueError:
        return None


def parse_listing(html: str) -> list[ReportLink]:
    """Return one ReportLink per distinct price-report PDF on the page, in page order.

    The date comes from the link title ("Daily Price Report - 06 November 2026"), falling back to the
    8-digit date in the file name, because file names changed format over the years.
    """
    soup = BeautifulSoup(html, "html.parser")
    seen: dict[str, ReportLink] = {}
    for a in soup.select(".views-row a[href]"):
        href = urljoin(CBSL_BASE, a["href"])
        if "/pricerpt/" not in href or not href.lower().endswith(".pdf"):
            continue
        title = a.get_text(" ", strip=True)
        existing = seen.get(href)
        if existing and existing.title:
            continue
        seen[href] = ReportLink(url=href, report_date=_date_from_title(title) or _date_from_url(href), title=title)
    return list(seen.values())


def last_page_index(html: str) -> int:
    """Highest ?page=N linked from the pager (pages are 0-indexed)."""
    pages = [int(n) for n in re.findall(r"price-report\?page=(\d+)", html)]
    return max(pages, default=0)
