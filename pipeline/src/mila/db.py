"""Postgres access (Neon in production, any Postgres in tests) and the tiny migration runner."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import psycopg

from mila.config import REPO_ROOT, database_url

MIGRATIONS_DIR = REPO_ROOT / "db" / "migrations"


@contextmanager
def connect(url: str | None = None) -> Iterator[psycopg.Connection]:
    with psycopg.connect(url or database_url(), autocommit=False) as conn:
        yield conn


def migrate(conn: psycopg.Connection, migrations_dir: Path = MIGRATIONS_DIR) -> list[str]:
    """Apply every db/migrations/*.sql not yet recorded, in file-name order. Returns the applied names."""
    conn.execute("create table if not exists schema_migrations (version text primary key, "
                 "applied_at timestamptz not null default now())")
    done = {r[0] for r in conn.execute("select version from schema_migrations")}
    applied = []
    for path in sorted(migrations_dir.glob("*.sql")):
        if path.name in done:
            continue
        conn.execute(path.read_text())
        conn.execute("insert into schema_migrations (version) values (%s)", (path.name,))
        applied.append(path.name)
    conn.commit()
    return applied


def sync_items(conn: psycopg.Connection) -> None:
    from mila.items import ITEMS

    with conn.cursor() as cur:
        cur.executemany(
            """insert into items (item_key, display_name, category, unit, region, basket)
               values (%s, %s, %s, %s, %s, %s)
               on conflict (item_key) do update set display_name = excluded.display_name,
                 category = excluded.category, unit = excluded.unit, region = excluded.region,
                 basket = excluded.basket""",
            [(i.key, i.name, i.category, i.unit, i.region, i.basket) for i in ITEMS],
        )
    conn.commit()


def mark_source(conn: psycopg.Connection, source: str, *, data_date=None, error: str | None = None) -> None:
    if error:
        conn.execute(
            """insert into source_health (source, last_error, last_error_at) values (%s, %s, now())
               on conflict (source) do update set last_error = excluded.last_error, last_error_at = now()""",
            (source, error[:2000]))
    else:
        conn.execute(
            """insert into source_health (source, last_success_at, last_data_date) values (%s, now(), %s)
               on conflict (source) do update set last_success_at = now(), last_error = null, last_error_at = null,
                 last_data_date = greatest(source_health.last_data_date, excluded.last_data_date)""",
            (source, data_date))
    conn.commit()
