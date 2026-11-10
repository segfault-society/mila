"""Resumable crawl of the CBSL listing and its PDFs into data/raw.

Writes data/raw/pdf/<file>.pdf and appends one JSON line per PDF to data/raw/index.jsonl. Re-running skips
every URL already recorded as "ok", so the 7-hour backfill can be stopped and restarted at any point.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

from mila.cbsl.http import PoliteClient
from mila.cbsl.listing import ReportLink, last_page_index, parse_listing
from mila.config import CBSL_LISTING_URL, LISTING_DIR, PDF_DIR, RAW_INDEX

log = logging.getLogger(__name__)


def load_index(path: Path = RAW_INDEX) -> dict[str, dict]:
    """url -> latest index record."""
    records: dict[str, dict] = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if line.strip():
                rec = json.loads(line)
                records[rec["url"]] = rec
    return records


def _append(path: Path, rec: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as f:
        f.write(json.dumps(rec, default=str) + "\n")


def listing_url(page: int) -> str:
    return CBSL_LISTING_URL if page == 0 else f"{CBSL_LISTING_URL}?page={page}"


def fetch_listing(client: PoliteClient, page: int, cache_dir: Path = LISTING_DIR) -> str:
    html = client.get(listing_url(page)).text
    cache_dir.mkdir(parents=True, exist_ok=True)
    (cache_dir / f"page_{page:03d}.html").write_text(html)
    return html


def download_pdf(client: PoliteClient, link: ReportLink, page: int,
                 pdf_dir: Path = PDF_DIR, index_path: Path = RAW_INDEX) -> dict:
    resp = client.get(link.url)
    rec = {
        "url": link.url,
        "file": link.url.rsplit("/", 1)[-1],
        "report_date": link.report_date.isoformat() if link.report_date else None,
        "title": link.title,
        "listing_page": page,
        "http_status": resp.status_code,
        "fetched_at": datetime.now(UTC).isoformat(),
    }
    is_pdf = resp.content[:5] == b"%PDF-"
    if resp.status_code == 200 and is_pdf:
        pdf_dir.mkdir(parents=True, exist_ok=True)
        (pdf_dir / rec["file"]).write_bytes(resp.content)
        rec.update(status="ok", sha256=hashlib.sha256(resp.content).hexdigest(), bytes=len(resp.content))
    else:
        rec.update(status="not_pdf" if resp.status_code == 200 else "http_error")
    _append(index_path, rec)
    return rec


def crawl(start_page: int = 0, end_page: int | None = None, client: PoliteClient | None = None,
          index_path: Path = RAW_INDEX, pdf_dir: Path = PDF_DIR) -> Iterator[dict]:
    """Walk listing pages newest-first, downloading every PDF not yet in the index. Yields index records."""
    client = client or PoliteClient()
    done = {u for u, r in load_index(index_path).items() if r.get("status") == "ok"}
    page = start_page
    last = end_page
    while last is None or page <= last:
        html = fetch_listing(client, page)
        if last is None:
            last = last_page_index(html)
            log.info("listing has pages 0..%d", last)
        links = parse_listing(html)
        if not links:
            log.warning("page %d has no report links; stopping", page)
            break
        for link in links:
            if link.url in done:
                continue
            rec = download_pdf(client, link, page, pdf_dir=pdf_dir, index_path=index_path)
            done.add(link.url)
            yield rec
        page += 1
