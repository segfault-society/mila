"""Command line entry point: `uv run mila <command>`."""

from __future__ import annotations

import logging

import typer

app = typer.Typer(no_args_is_help=True, add_completion=False)


@app.callback()
def _main(verbose: bool = typer.Option(False, "--verbose", "-v")) -> None:
    logging.basicConfig(level=logging.DEBUG if verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@app.command()
def crawl(start_page: int = 0,
          end_page: int = typer.Option(None, help="last listing page (default: all)")) -> None:
    """Download CBSL Daily Price Report PDFs into data/raw (resumable, 10 s between requests)."""
    from mila.cbsl.crawl import crawl as run_crawl

    n = 0
    for rec in run_crawl(start_page=start_page, end_page=end_page):
        n += 1
        typer.echo(f"[{n}] p{rec['listing_page']} {rec['report_date']} {rec['status']} {rec['file']}")


@app.command()
def migrate() -> None:
    """Apply database migrations and sync the item catalogue."""
    from mila.db import connect, migrate as run, sync_items

    with connect() as conn:
        typer.echo(f"applied: {run(conn) or 'nothing new'}")
        sync_items(conn)


@app.command()
def ingest(reparse: bool = False, workers: int = 6) -> None:
    """Register crawled PDFs, then parse + validate + store every pending one."""
    from mila.db import connect, mark_source
    from mila.ingest import ingest_pending, register_documents

    with connect() as conn:
        typer.echo(f"registered {register_documents(conn)} new documents")
        counts = ingest_pending(conn, workers=workers, reparse=reparse)
        typer.echo(f"ingest: {counts}")
        latest = conn.execute("select max(obs_date) from prices").fetchone()[0]
        mark_source(conn, "cbsl_prices", data_date=latest)


@app.command()
def probe(pages: str = "205,190,170,150,130,110,90,70,50,30") -> None:
    """Fetch the oldest report on each of a few listing pages, to see every era's PDF layout early."""
    from mila.cbsl.crawl import download_pdf, fetch_listing, load_index
    from mila.cbsl.http import PoliteClient
    from mila.cbsl.listing import parse_listing

    client = PoliteClient()
    done = load_index()
    for page in (int(p) for p in pages.split(",")):
        links = parse_listing(fetch_listing(client, page))
        if not links:
            typer.echo(f"p{page}: no links")
            continue
        link = links[-1]
        if done.get(link.url, {}).get("status") == "ok":
            continue
        rec = download_pdf(client, link, page)
        typer.echo(f"p{page} {rec['report_date']} {rec['status']} {rec['file']}")


if __name__ == "__main__":
    app()
