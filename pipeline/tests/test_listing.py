from datetime import date
from pathlib import Path

from mila.cbsl.http import PoliteClient
from mila.cbsl.listing import last_page_index, parse_listing

FIXTURE = Path(__file__).parent / "fixtures" / "listing_sample.html"


def test_parse_listing_dedupes_and_dates():
    links = parse_listing(FIXTURE.read_text())
    assert [link.report_date for link in links] == [date(2026, 11, 9), date(2016, 10, 3), date(2017, 1, 5)]
    assert links[0].title == "Daily Price Report - 09 November 2026"
    assert links[1].url.startswith("https://www.cbsl.gov.lk/sites/default/files/")
    assert all("/pricerpt/" in link.url for link in links)


def test_last_page_index():
    assert last_page_index(FIXTURE.read_text()) == 205


def test_polite_client_waits_between_requests():
    t = [0.0]
    sleeps: list[float] = []

    def sleep(s: float) -> None:
        sleeps.append(s)
        t[0] += s

    client = PoliteClient(delay_s=10, sleep=sleep, clock=lambda: t[0])
    client._wait_turn()
    t[0] += 3
    client._wait_turn()
    assert sleeps == [7]
