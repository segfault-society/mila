"""Rainfall for vegetable growing areas from Open-Meteo (ERA5 archive + 16-day forecast). CC BY 4.0."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import date, timedelta

import httpx
import pandas as pd
import psycopg

from mila.config import TIMEZONE, USER_AGENT

log = logging.getLogger(__name__)

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
DAILY = "precipitation_sum,temperature_2m_max,temperature_2m_min"
CLIMATE_START, CLIMATE_END = date(1991, 1, 1), date(2020, 12, 31)


@dataclass(frozen=True)
class Point:
    key: str
    name: str
    lat: float
    lon: float
    region: str


POINTS = [
    Point("nuwara_eliya", "Nuwara Eliya", 6.97, 80.78, "upcountry"),
    Point("bandarawela", "Bandarawela", 6.83, 80.99, "upcountry"),
    Point("welimada", "Welimada", 6.90, 80.91, "upcountry"),
    Point("dambulla", "Dambulla", 7.86, 80.65, "dryzone"),
    Point("kekirawa", "Kekirawa", 8.04, 80.59, "dryzone"),
    Point("sigiriya", "Sigiriya", 7.95, 80.76, "dryzone"),
    Point("jaffna", "Jaffna", 9.66, 80.01, "north"),
    Point("kalpitiya", "Kalpitiya", 8.23, 79.77, "north"),
]
REGION_POINTS = {r: [p for p in POINTS if p.region == r] for r in {p.region for p in POINTS}}


PAUSE_S = 12.0  # Open-Meteo weights requests by days x variables; pace the long archive pulls


def _frame(payload: dict, point: Point, source: str) -> pd.DataFrame:
    d = payload["daily"]
    n = len(d["time"])
    return pd.DataFrame({
        "point_key": point.key,
        "obs_date": pd.to_datetime(d["time"]).date,
        "source": source,
        "precip_mm": d["precipitation_sum"],
        "tmax_c": d.get("temperature_2m_max", [None] * n),
        "tmin_c": d.get("temperature_2m_min", [None] * n),
    })


def _get(client: httpx.Client, url: str, params: dict) -> dict:
    for attempt in range(4):
        r = client.get(url, params=params)
        if r.status_code == 429:
            time.sleep(65 * (attempt + 1))
            continue
        if r.status_code >= 500:
            time.sleep(10 * (attempt + 1))
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError(f"Open-Meteo kept rate-limiting {url}")


def fetch_archive(point: Point, start: date, end: date, client: httpx.Client) -> pd.DataFrame:
    """Rain only (temperature is not a model input), in chunks of at most 8 years."""
    frames = []
    chunk_start = start
    while chunk_start <= end:
        chunk_end = min(end, date(chunk_start.year + 7, 12, 31))
        payload = _get(client, ARCHIVE_URL, {"latitude": point.lat, "longitude": point.lon,
                                             "start_date": chunk_start.isoformat(), "end_date": chunk_end.isoformat(),
                                             "daily": "precipitation_sum", "timezone": TIMEZONE})
        frames.append(_frame(payload, point, "archive"))
        chunk_start = chunk_end + timedelta(days=1)
        if chunk_start <= end:
            time.sleep(PAUSE_S)
    return pd.concat(frames, ignore_index=True)


def fetch_forecast(point: Point, client: httpx.Client) -> pd.DataFrame:
    payload = _get(client, FORECAST_URL, {"latitude": point.lat, "longitude": point.lon, "daily": DAILY,
                                          "past_days": 10, "forecast_days": 16, "timezone": TIMEZONE})
    return _frame(payload, point, "forecast")


def _upsert(conn: psycopg.Connection, df: pd.DataFrame) -> int:
    df = df.where(pd.notna(df), None)
    with conn.cursor() as cur:
        cur.execute("create temp table w_stage (like weather_daily including defaults) on commit drop")
        with cur.copy("copy w_stage (point_key, obs_date, source, precip_mm, tmax_c, tmin_c) from stdin") as cp:
            for row in df.itertuples(index=False):
                cp.write_row(row)
        cur.execute("""insert into weather_daily (point_key, obs_date, source, precip_mm, tmax_c, tmin_c)
                       select point_key, obs_date, source, precip_mm, tmax_c, tmin_c from w_stage
                       on conflict (point_key, obs_date, source) do update set precip_mm = excluded.precip_mm,
                         tmax_c = excluded.tmax_c, tmin_c = excluded.tmin_c, fetched_at = now()""")
        n = cur.rowcount
    conn.commit()
    return n


def update_weather(conn: psycopg.Connection, full: bool = False, today: date | None = None) -> dict[str, int]:
    """Archive (incremental, or from 1991 when full=True) plus the forecast endpoint for every point."""
    today = today or date.today()
    counts = {"archive": 0, "forecast": 0}
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=120) as client:
        for p in POINTS:
            last = conn.execute("select max(obs_date) from weather_daily where point_key = %s and source = 'archive'",
                                (p.key,)).fetchone()[0]
            start = CLIMATE_START if full or last is None else last - timedelta(days=7)
            end = today - timedelta(days=2)
            if start <= end:
                counts["archive"] += _upsert(conn, fetch_archive(p, start, end, client))
                if full:
                    time.sleep(PAUSE_S)
            counts["forecast"] += _upsert(conn, fetch_forecast(p, client))
    return counts


def load_daily_rain(conn: psycopg.Connection) -> pd.DataFrame:
    """One rain value per point and day: archive where available, the forecast endpoint after that."""
    df = pd.read_sql("""select point_key, obs_date, source, precip_mm from weather_daily""", conn)
    df["obs_date"] = pd.to_datetime(df["obs_date"]).astype("datetime64[ns]")
    df["rank"] = (df["source"] == "forecast").astype(int)
    df = df.sort_values("rank").drop_duplicates(["point_key", "obs_date"], keep="first")
    return df.pivot(index="obs_date", columns="point_key", values="precip_mm").sort_index()


def region_rain(rain: pd.DataFrame) -> pd.DataFrame:
    """Daily mean rain per region (columns: upcountry, dryzone, north)."""
    return pd.DataFrame({r: rain[[p.key for p in pts if p.key in rain]].mean(axis=1)
                         for r, pts in REGION_POINTS.items()})


def climatology(region_daily: pd.DataFrame, window: int) -> pd.DataFrame:
    """Normal `window`-day rain total for each region and day of year, from 1991-2020."""
    base = region_daily.loc[str(CLIMATE_START):str(CLIMATE_END)].rolling(window, min_periods=window).sum()
    clim = base.groupby(base.index.dayofyear).mean()
    return clim.rolling(15, center=True, min_periods=1).mean()  # smooth day-to-day noise
