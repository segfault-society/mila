"""Load crawled PDFs into Postgres: register raw documents, parse, validate, store prices."""

from __future__ import annotations

import json
import logging
from concurrent.futures import ProcessPoolExecutor
from datetime import date
from pathlib import Path

import psycopg

from mila.cbsl.crawl import load_index
from mila.cbsl.parse import ParsedReport, ParseError, parse_pdf
from mila.cbsl.validate import Series, validate
from mila.config import PDF_DIR, RAW_INDEX

log = logging.getLogger(__name__)
PARSER_VERSION = "layout-v1"


def register_documents(conn: psycopg.Connection, index_path: Path = RAW_INDEX) -> int:
    """Upsert every successfully crawled PDF from index.jsonl into raw_documents. Returns rows inserted."""
    recs = [r for r in load_index(index_path).values() if r.get("status") == "ok" and r.get("report_date")]
    with conn.cursor() as cur:
        cur.executemany(
            """insert into raw_documents (report_date, source_url, file_name, sha256, bytes, fetched_at)
               values (%s, %s, %s, %s, %s, %s) on conflict (source_url) do nothing""",
            [(r["report_date"], r["url"], r["file"], r["sha256"], r["bytes"], r["fetched_at"]) for r in recs],
        )
        n = cur.rowcount
    conn.commit()
    return max(n, 0)


def _parse_one(path: str) -> tuple[ParsedReport | None, str | None]:
    try:
        return parse_pdf(Path(path)), None
    except ParseError as exc:
        return None, f"ParseError: {exc}"
    except Exception as exc:  # malformed PDF etc.: record, never crash the batch
        return None, f"{type(exc).__name__}: {exc}"


def _last_prices(conn: psycopg.Connection, before: date) -> dict[Series, tuple[date, float]]:
    rows = conn.execute(
        """select distinct on (item_key, market, price_type) item_key, market, price_type, obs_date, price
           from prices where obs_date < %s and obs_date > %s::date - 15
           order by item_key, market, price_type, obs_date desc""", (before, before)).fetchall()
    return {(r[0], r[1], r[2]): (r[3], float(r[4])) for r in rows}


def store(conn: psycopg.Connection, doc_id: int, report_date: date, report: ParsedReport | None,
          error: str | None, last: dict[Series, tuple[date, float]]) -> str:
    """Validate one parsed document and write its rows. Returns the final parse_status."""
    with conn.cursor() as cur:
        cur.execute("delete from validation_issues where source_doc_id = %s", (doc_id,))
        if report is None:
            cur.execute("""update raw_documents set parse_status = 'failed', parser = %s, parse_error = %s,
                           parsed_at = now() where id = %s""", (PARSER_VERSION, error, doc_id))
            conn.commit()
            return "failed"
        v = validate(report, report_date, last)
        cur.executemany(
            """insert into prices (obs_date, item_key, market, price_type, price, source_doc_id)
               values (%s, %s, %s, %s, %s, %s) on conflict do nothing""",
            [(report_date, s[0], s[1], s[2], p, doc_id) for s, p in v.prices.items()])
        cur.executemany(
            """insert into price_echoes (report_date, comparison_date, item_key, market, price_type, price,
               source_doc_id) values (%s, %s, %s, %s, %s, %s, %s) on conflict do nothing""",
            [(report_date, d, s[0], s[1], s[2], p, doc_id) for s, (p, d) in v.echoes.items()])
        cur.executemany(
            "insert into validation_issues (source_doc_id, severity, rule, detail) values (%s, %s, %s, %s)",
            [(doc_id, i.severity, i.rule, json.dumps(i.detail, default=str)) for i in v.issues])
        cur.execute("""update raw_documents set parse_status = %s, parser = %s, parse_error = null,
                       parsed_at = now() where id = %s""", (v.status, PARSER_VERSION, doc_id))
    conn.commit()
    last.update({s: (report_date, p) for s, p in v.prices.items()})
    return v.status


def ingest_pending(conn: psycopg.Connection, pdf_dir: Path = PDF_DIR, workers: int = 6,
                   reparse: bool = False) -> dict[str, int]:
    """Parse every pending document (oldest first, so the jump rule sees history) and store the results."""
    if reparse:
        conn.execute("update raw_documents set parse_status = 'pending' where parse_status <> 'pending'")
        conn.commit()
    docs = conn.execute(
        """select id, report_date, file_name from raw_documents where parse_status = 'pending'
           order by report_date, file_name""").fetchall()
    # only documents whose PDF is on this machine: a cloud runner must not mark other machines' work failed
    docs = [d for d in docs if (pdf_dir / d[2]).exists()]
    counts: dict[str, int] = {}
    if not docs:
        return counts
    last = _last_prices(conn, docs[0][1])
    paths = [str(pdf_dir / d[2]) for d in docs]
    with ProcessPoolExecutor(max_workers=workers) as pool:
        for (doc_id, report_date, _), (report, err) in zip(docs, pool.map(_parse_one, paths, chunksize=4),
                                                           strict=True):
            status = store(conn, doc_id, report_date, report, err, last)
            counts[status] = counts.get(status, 0) + 1
    return counts
