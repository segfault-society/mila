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
    from mila.db import connect, sync_items
    from mila.db import migrate as run

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
def weather(full: bool = False) -> None:
    """Fetch Open-Meteo rainfall (archive + forecast) for the growing-area points."""
    from mila.db import connect, mark_source
    from mila.weather import update_weather

    with connect() as conn:
        try:
            counts = update_weather(conn, full=full)
        except Exception as exc:
            mark_source(conn, "open_meteo", error=str(exc))
            raise
        latest = conn.execute("select max(obs_date) from weather_daily where source = 'archive'").fetchone()[0]
        mark_source(conn, "open_meteo", data_date=latest)
        typer.echo(f"weather rows upserted: {counts}")


@app.command()
def forecast() -> None:
    """Fit, calibrate and forecast every series from the latest report; store a forecast run."""
    from mila.db import connect
    from mila.forecast import run_forecast

    with connect() as conn:
        typer.echo(f"forecast run {run_forecast(conn)}")


@app.command()
def backtest(start: str = "2022-01-01", holdout: str = "2024-01-01", step_months: int = 3,
             ablation: bool = True, out: str = "../reports") -> None:
    """Rolling-origin backtest + baselines; writes reports/backtest.md and backtest_scores."""
    from mila.db import connect
    from mila.report import write_backtest_report

    with connect() as conn:
        path = write_backtest_report(conn, start=start, holdout=holdout, step_months=step_months,
                                     ablation=ablation, out_dir=out)
        typer.echo(f"wrote {path}")


@app.command("subscriber-add")
def subscriber_add(name: str, basket: str = typer.Option(..., help="item=qty,item=qty (kg or units per day)"),
                   market: str = "pettah", price_type: str = "wholesale",
                   phone: str = typer.Option(None, help="E.164, e.g. +9477xxxxxxx; omit for a dry-run demo")) -> None:
    """Add an eatery owner. Prints their private dashboard token."""
    import json
    import secrets

    from mila.db import connect
    from mila.items import ITEMS_BY_KEY

    items = dict(kv.split("=") for kv in basket.split(","))
    unknown = [k for k in items if k not in ITEMS_BY_KEY]
    if unknown:
        raise typer.BadParameter(f"unknown items: {unknown}")
    token = secrets.token_urlsafe(9)
    with connect() as conn:
        conn.execute("""insert into subscribers (name, phone_e164, market, price_type, basket, token)
                        values (%s, %s, %s, %s, %s, %s)""",
                     (name, phone, market, price_type, json.dumps({k: float(v) for k, v in items.items()}), token))
        conn.commit()
    typer.echo(f"token: {token}  (dashboard: /o/{token})")


@app.command()
def digest(send_now: bool = typer.Option(False, "--send", help="record/send instead of just printing")) -> None:
    """Build the digest for every active subscriber (dry-run sends unless an SMS provider is configured)."""
    from datetime import date

    from mila.db import connect
    from mila.digest import build_digest, build_digest_email
    from mila.emailer import email_enabled, send_email
    from mila.sms import send

    with connect() as conn:
        subs = conn.execute("select id, phone_e164, email from subscribers where active order by id").fetchall()
        for sid, phone, email in subs:
            run_id, body = build_digest(conn, sid, date.today())
            typer.echo(f"--- subscriber {sid} ({len(body)} chars)\n{body}")
            if not send_now:
                continue
            typer.echo(f"sms: {send(conn, sid, run_id, phone, body)}")
            if email and email_enabled():
                _, subject, text, html = build_digest_email(conn, sid, date.today())
                try:
                    pid, status = send_email(email, subject, text, html), "sent"
                except Exception as exc:  # record the failure, keep going with the next owner
                    pid, status = None, f"failed: {str(exc)[:200]}"
                conn.execute("""insert into messages (subscriber_id, run_id, channel, body, status, provider_id)
                                values (%s, %s, 'email', %s, %s, %s)""", (sid, run_id, subject, status, pid))
                conn.commit()
                typer.echo(f"email: {status}")


@app.command("email-test")
def email_test(to: str = typer.Option(..., help="address to send the demo kitchen's digest to")) -> None:
    """Send the first subscriber's digest to one address, to check email delivery end to end."""
    from datetime import date

    from mila.db import connect
    from mila.digest import build_digest_email
    from mila.emailer import send_email

    with connect() as conn:
        sid = conn.execute("select id from subscribers where active order by id limit 1").fetchone()[0]
        _, subject, text, html = build_digest_email(conn, sid, date.today())
    typer.echo(f"sent: {send_email(to, subject, text, html)}")


@app.command()
def daily(skip_crawl: bool = False) -> None:
    """The unattended job: new CBSL report(s) -> ingest -> weather -> forecast (only when there is new data)."""
    from mila.cbsl.crawl import crawl as run_crawl
    from mila.db import connect, mark_source
    from mila.forecast import run_forecast
    from mila.ingest import ingest_pending, register_documents
    from mila.weather import update_weather

    with connect() as conn:
        if not skip_crawl:
            try:
                known = {r[0] for r in conn.execute("select source_url from raw_documents")}
                new = list(run_crawl(start_page=0, end_page=0, known_urls=known))
                typer.echo(f"crawl: {len(new)} new PDFs")
            except Exception as exc:
                mark_source(conn, "cbsl_prices", error=str(exc))
                raise
        register_documents(conn)
        counts = ingest_pending(conn, workers=2)
        latest = conn.execute("select max(obs_date) from prices").fetchone()[0]
        mark_source(conn, "cbsl_prices", data_date=latest)
        try:
            update_weather(conn)
            mark_source(conn, "open_meteo", data_date=conn.execute(
                "select max(obs_date) from weather_daily where source = 'archive'").fetchone()[0])
        except Exception as exc:  # stale weather is flagged, not fatal: the model has a no-weather fallback
            mark_source(conn, "open_meteo", error=str(exc))
        from mila.scoring import score_forecasts

        typer.echo(f"scored {score_forecasts(conn)} forecasts against real prices")
        last_run = conn.execute("select max(data_date) from forecast_runs").fetchone()[0]
        if counts.get("parsed") or last_run is None or last_run < latest:
            from mila.alerts import run_alerts

            run_id = run_forecast(conn)
            typer.echo(f"forecast run {run_id}; alerts: {run_alerts(conn, run_id)}")
        else:
            typer.echo("no new prices; forecast unchanged")


@app.command()
def score() -> None:
    """Score live forecasts whose 7-day target date now has a CBSL report."""
    from mila.db import connect
    from mila.scoring import live_summary, score_forecasts

    with connect() as conn:
        typer.echo(f"scored {score_forecasts(conn)} forecasts; live record: {live_summary(conn)}")


@app.command()
def alerts(send: bool = typer.Option(True, help="email owners (needs RESEND_API_KEY)")) -> None:
    """Check every active price alert against the latest forecast run; record and email new ones."""
    from mila.alerts import run_alerts
    from mila.db import connect

    with connect() as conn:
        typer.echo(f"alerts: {run_alerts(conn, send=send)}")


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
