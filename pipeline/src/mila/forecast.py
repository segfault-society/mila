"""Live forecasting: fit on everything known, forecast every series from its latest report, store the run."""

from __future__ import annotations

import json
import logging
import math
import subprocess

import numpy as np
import pandas as pd
import psycopg

from mila.features import HORIZON, build_features, load_prices, weather_inputs
from mila.items import ITEMS_BY_KEY
from mila.model import Model, fit_calibrated
from mila.weather import REGION_POINTS

log = logging.getLogger(__name__)

REGION_NAMES = {"upcountry": "the up-country growing areas (Nuwara Eliya, Welimada, Bandarawela)",
                "dryzone": "the dry-zone growing areas (Dambulla, Kekirawa, Sigiriya)",
                "north": "the northern growing areas (Jaffna, Kalpitiya)"}
FEATURE_TEXT = {
    "ret_5": "the price trend over the last week", "ret_10": "the two-week price trend",
    "ret_20": "the price trend over the last month", "lvl_60": "where the price sits against its 2-month average",
    "vol_20": "how volatile the price has been", "ws_spread": "the gap between wholesale and retail",
    "pd_spread": "the gap between Pettah and Dambulla", "whole_ret5": "this week's wholesale move",
    "item_ret5": "how this item moved across all markets", "rain_7": "rain in the growing areas this week",
    "rain_14": "rain in the growing areas over two weeks", "rain_30": "rain in the growing areas this month",
    "rain_anom_7": "this week's rain against the seasonal normal", "rain_anom_30": "this month's rain against normal",
    "days_to_holiday": "an upcoming holiday", "days_to_avurudu": "the run-up to Avurudu",
    "month_sin": "the time of year", "month_cos": "the time of year", "maha": "the Maha season",
}


def _model_settings(conn: psycopg.Connection) -> tuple[str, float]:
    rows = dict(conn.execute("""select metric, value from backtest_scores
                                where run_label = 'latest' and item_key = '_model'""").fetchall())
    source = "classifier" if rows.get("spike_source_is_classifier", 1.0) >= 0.5 else "distribution"
    return source, float(rows.get("spike_threshold", 0.5))


def _forecast_rain(conn: psycopg.Connection, data_date: pd.Timestamp) -> dict[str, float]:
    """Forecast rain total for the next 7 days per region (mm, mean over the region's points)."""
    df = pd.read_sql("""select point_key, sum(precip_mm) as mm from weather_daily
                        where source = 'forecast' and obs_date > %(d)s and obs_date <= %(d)s::date + 7
                        group by point_key""", conn, params={"d": data_date.date()})
    mm = dict(zip(df["point_key"], df["mm"], strict=True))
    return {r: float(np.mean([mm[p.key] for p in pts if p.key in mm])) for r, pts in REGION_POINTS.items()
            if any(p.key in mm for p in pts)}


def explain(row: pd.Series, contrib: pd.Series, fc_rain: dict[str, float]) -> list[str]:
    """Plain-language reasons, most important first. Facts first, then the model's top drivers."""
    out: list[str] = []
    region = row.get("region")
    if isinstance(region, str) and not pd.isna(row.get("rain_anom_7")):
        if row["rain_anom_7"] >= 1.5 and row["rain_7"] >= 20:
            out.append(f"{row['rain_7']:.0f} mm of rain fell in {REGION_NAMES[region]} in the last 7 days, "
                       f"{row['rain_anom_7']:.1f}x the seasonal normal")
        elif row["rain_anom_7"] <= 0.4 and row.get("rain_anom_30", 1) <= 0.5:
            out.append(f"{REGION_NAMES[region].capitalize()} have had well below normal rain this month")
        if fc_rain.get(region, 0) >= 60:
            out.append(f"About {fc_rain[region]:.0f} mm of rain is forecast for {REGION_NAMES[region]} next week")
    where = f"{str(row['market']).capitalize()} {row['price_type']}"
    if not pd.isna(row.get("ret_5")) and abs(row["ret_5"]) >= math.log(1.08):
        out.append(f"{where} already {'up' if row['ret_5'] > 0 else 'down'} "
                   f"{abs(math.exp(row['ret_5']) - 1) * 100:.0f}% over the last week")
    if (row["price_type"] == "retail" and not pd.isna(row.get("whole_ret5")) and row["whole_ret5"] >= math.log(1.08)
            and (pd.isna(row.get("ret_5")) or row["ret_5"] < row["whole_ret5"] / 2)):
        out.append(f"Wholesale is up {(math.exp(row['whole_ret5']) - 1) * 100:.0f}% this week and retail "
                   f"usually follows within days")
    if not pd.isna(row.get("lvl_60")) and abs(row["lvl_60"]) >= math.log(1.25):
        out.append(f"The price is {abs(math.exp(row['lvl_60']) - 1) * 100:.0f}% "
                   f"{'above' if row['lvl_60'] > 0 else 'below'} its 2-month average")
    if row.get("days_to_holiday", 99) <= 7:
        out.append(f"Public holiday in {int(row['days_to_holiday'])} days")
    for feat in contrib.abs().sort_values(ascending=False).index[:3]:
        text = FEATURE_TEXT.get(feat)
        if feat == "days_to_avurudu" and row.get("days_to_avurudu", 999) > 30:
            continue
        if feat == "days_to_holiday" and row.get("days_to_holiday", 999) > 10:
            continue
        if text and not any(text.split()[1] in s.lower() for s in out):
            direction = "pushing the forecast up" if contrib[feat] > 0 else "pulling the forecast down"
            out.append(f"Model: {text} is {direction}")
            if len(out) >= 4:
                break
    return out[:4]


def latest_rows(df: pd.DataFrame, data_date: pd.Timestamp) -> pd.DataFrame:
    d = df[df["obs_date"] <= data_date]
    idx = d.groupby(["item_key", "market", "price_type"], observed=True)["obs_date"].idxmax()
    return d.loc[idx.to_numpy()].reset_index(drop=True)


def _git_sha() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True,
                              check=True).stdout.strip()
    except Exception:
        return "nogit"


def run_forecast(conn: psycopg.Connection, data_date: pd.Timestamp | None = None) -> int:
    prices = load_prices(conn)
    df = build_features(prices, weather_inputs(conn))
    data_date = data_date or df["obs_date"].max()
    source, threshold = _model_settings(conn)
    model: Model = fit_calibrated(df[df["obs_date"] <= data_date], spike_source=source, spike_threshold=threshold)
    now = latest_rows(df, data_date)
    now = now[now["item_key"].astype(str).isin(ITEMS_BY_KEY)]
    pred = model.predict(now)
    reasons = model.abstain_reasons(now, pred, data_date)
    signals = model.signals(now, pred, reasons)
    contrib = pd.DataFrame(model.quantile_models[0.5].predict(now[model.features], pred_contrib=True)[:, :-1],
                           columns=model.features, index=now.index)
    fc_rain = _forecast_rain(conn, data_date)
    version = f"lgbm-cqr-{source}-{_git_sha()}"
    train_rows = int(df["y"].notna().sum())
    with conn.cursor() as cur:
        cur.execute("""insert into forecast_runs (data_date, horizon_days, model_version, train_rows, notes)
                       values (%s, %s, %s, %s, %s) returning id""",
                    (data_date.date(), HORIZON, version, train_rows,
                     json.dumps({"spike_threshold": threshold, "spike_source": source,
                                 "cqr_pooled": model.q_adjust_pooled})))
        run_id = cur.fetchone()[0]
        rows = []
        for i, r in now.iterrows():
            base = float(r["price"])
            p = pred.loc[i]
            sig = signals.loc[i]
            q = (None, None, None) if sig == "no_forecast" else tuple(
                round(base * math.exp(p[c]), 2) for c in ("q10", "q50", "q90"))
            rows.append((run_id, str(r["item_key"]), str(r["market"]), str(r["price_type"]), r["obs_date"].date(),
                         base, (r["obs_date"] + pd.Timedelta(days=HORIZON)).date(), *q,
                         None if sig == "no_forecast" else float(p["spike_prob"]), sig, reasons.loc[i],
                         json.dumps(explain(r, contrib.loc[i], fc_rain))))
        cur.executemany("""insert into forecasts (run_id, item_key, market, price_type, base_date, base_price,
                           target_date, q10, q50, q90, spike_prob, signal, abstain_reason, drivers)
                           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""", rows)
    conn.commit()
    log.info("forecast run %d: %d series, signals %s", run_id, len(rows), signals.value_counts().to_dict())
    return run_id
