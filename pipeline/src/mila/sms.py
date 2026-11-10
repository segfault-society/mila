"""SMS delivery. Until a gateway account exists, SMS_PROVIDER=dry_run records messages without sending."""

from __future__ import annotations

import os

import psycopg


def send(conn: psycopg.Connection, subscriber_id: int, run_id: int, phone: str | None, body: str) -> str:
    provider = os.environ.get("SMS_PROVIDER", "dry_run")
    if provider == "dry_run" or not phone:
        status, provider_id = "dry_run", None
    else:  # plug the chosen Sri Lankan gateway in here once its account and API key exist
        raise NotImplementedError(f"SMS provider {provider!r} is not wired up yet")
    conn.execute("""insert into messages (subscriber_id, run_id, channel, body, status, provider_id)
                    values (%s, %s, 'sms', %s, %s, %s)""", (subscriber_id, run_id, body, status, provider_id))
    conn.commit()
    return status
