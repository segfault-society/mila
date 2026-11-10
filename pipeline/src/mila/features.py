"""Feature table: one row per (series, trading day) with the 7-day log-change target.

Everything here only looks backwards from the row's date (rain is lagged a day), so the backtest cannot see
the future. The target y = log(P(t+h) / P(t)) uses the last report on or before t+h (and at least h-2 days ahead).
"""

from __future__ import annotations

import math
from datetime import date

import holidays
import numpy as np
import pandas as pd

from mila.items import ITEMS_BY_KEY

HORIZON = 7
SPIKE = math.log(1.25)
RET_LAGS = (1, 2, 5, 10, 20)
RAIN_WINDOWS = (3, 7, 14, 30)

PRICE_FEATURES = [f"ret_{k}" for k in RET_LAGS] + ["vol_20", "lvl_60", "gap_days", "max_ret5_60",
                                                    "ws_spread", "pd_spread", "item_ret5", "whole_ret5"]
RAIN_FEATURES = [f"rain_{w}" for w in RAIN_WINDOWS] + ["rain_anom_7", "rain_anom_30"]
CAL_FEATURES = ["dow", "month_sin", "month_cos", "days_to_holiday", "days_to_avurudu", "maha"]
CAT_FEATURES = ["item_key", "market", "price_type"]
FEATURES = PRICE_FEATURES + RAIN_FEATURES + CAL_FEATURES + CAT_FEATURES


def load_prices(conn) -> pd.DataFrame:
    df = pd.read_sql("select obs_date, item_key, market, price_type, price::float as price from prices", conn)
    df["obs_date"] = pd.to_datetime(df["obs_date"]).astype("datetime64[ns]")
    return df


def _price_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values(["item_key", "market", "price_type", "obs_date"]).reset_index(drop=True)
    df["lp"] = np.log(df["price"])
    g = df.groupby(["item_key", "market", "price_type"], sort=False)
    for k in RET_LAGS:
        df[f"ret_{k}"] = df["lp"] - g["lp"].shift(k)
    df["vol_20"] = g["ret_1"].transform(lambda s: s.rolling(20, min_periods=8).std())
    df["lvl_60"] = df["lp"] - g["lp"].transform(lambda s: s.rolling(60, min_periods=15).mean())
    df["gap_days"] = g["obs_date"].diff().dt.days
    df["max_ret5_60"] = g["ret_5"].transform(lambda s: s.rolling(60, min_periods=10).max())

    wide = df.pivot_table(index=["obs_date", "item_key", "market"], columns="price_type", values="lp")
    ws = (wide.get("retail") - wide.get("wholesale")).rename("ws_spread") if {"retail", "wholesale"} <= set(
        wide.columns) else pd.Series(dtype=float, name="ws_spread")
    df = df.merge(ws.reset_index(), on=["obs_date", "item_key", "market"], how="left")

    mk = df.pivot_table(index=["obs_date", "item_key", "price_type"], columns="market", values="lp")
    if {"pettah", "dambulla"} <= set(mk.columns):
        pdsp = (mk["pettah"] - mk["dambulla"]).rename("pd_spread").reset_index()
        df = df.merge(pdsp, on=["obs_date", "item_key", "price_type"], how="left")
    else:
        df["pd_spread"] = np.nan

    df["item_ret5"] = df.groupby(["obs_date", "item_key"])["ret_5"].transform("mean")
    whole = df[df["price_type"] == "wholesale"][["obs_date", "item_key", "market", "ret_5"]].rename(
        columns={"ret_5": "whole_ret5"})
    df = df.merge(whole, on=["obs_date", "item_key", "market"], how="left")
    return df


def _target(df: pd.DataFrame, horizon: int) -> pd.DataFrame:
    """y = log change to the last observation on/before t+horizon (but at least horizon-2 days later)."""
    out = []
    for _, s in df.groupby(["item_key", "market", "price_type"], sort=False):
        s = s.sort_values("obs_date")
        look = pd.DataFrame({"target_date": s["obs_date"] + pd.Timedelta(days=horizon), "idx": s.index})
        fut = s[["obs_date", "lp"]].rename(columns={"obs_date": "fut_date", "lp": "fut_lp"})
        m = pd.merge_asof(look.sort_values("target_date"), fut.sort_values("fut_date"),
                          left_on="target_date", right_on="fut_date", direction="backward")
        m = m.set_index("idx")
        ok = (m["fut_date"] - (m["target_date"] - pd.Timedelta(days=horizon))).dt.days >= horizon - 2
        out.append(pd.DataFrame({"fut_lp": m["fut_lp"].where(ok), "fut_date": m["fut_date"].where(ok)}))
    t = pd.concat(out)
    df = df.join(t)
    df["y"] = df["fut_lp"] - df["lp"]
    df["spike"] = (df["y"] >= SPIKE).astype(float).where(df["y"].notna())
    return df.drop(columns=["fut_lp"])


def rain_table(region_daily: pd.DataFrame, clim7: pd.DataFrame, clim30: pd.DataFrame) -> pd.DataFrame:
    """Per region and calendar day: rain totals over the windows ending YESTERDAY, and anomalies vs normal."""
    lagged = region_daily.shift(1)
    frames = []
    for region in region_daily.columns:
        r = pd.DataFrame(index=region_daily.index)
        for w in RAIN_WINDOWS:
            r[f"rain_{w}"] = lagged[region].rolling(w, min_periods=max(1, w - 2)).sum()
        doy = r.index.dayofyear
        r["rain_anom_7"] = (r["rain_7"] + 5) / (clim7[region].reindex(doy).to_numpy() + 5)
        r["rain_anom_30"] = (r["rain_30"] + 10) / (clim30[region].reindex(doy).to_numpy() + 10)
        r["region"] = region
        frames.append(r.reset_index(names="obs_date"))
    out = pd.concat(frames, ignore_index=True)
    out["obs_date"] = out["obs_date"].astype("datetime64[ns]")
    return out


def _calendar(dates: pd.Series) -> pd.DataFrame:
    years = range(dates.dt.year.min() - 1, dates.dt.year.max() + 2)
    hol = sorted(pd.Timestamp(d) for d in holidays.country_holidays("LK", years=years))
    hol_arr = np.array(hol, dtype="datetime64[ns]")
    uniq = pd.Series(dates.unique()).astype("datetime64[ns]").sort_values()
    idx = np.searchsorted(hol_arr, uniq.to_numpy())
    nxt = hol_arr[np.minimum(idx, len(hol_arr) - 1)]
    cal = pd.DataFrame({"obs_date": pd.to_datetime(uniq.to_numpy()).astype("datetime64[ns]")})
    cal["days_to_holiday"] = (nxt - cal["obs_date"].to_numpy()).astype("timedelta64[D]").astype(float)
    av = pd.to_datetime(cal["obs_date"].dt.year.astype(str) + "-04-14")
    av = av.where(av >= cal["obs_date"], av + pd.DateOffset(years=1))
    cal["days_to_avurudu"] = (av - cal["obs_date"]).dt.days.astype(float)
    cal["dow"] = cal["obs_date"].dt.dayofweek
    m = cal["obs_date"].dt.month
    cal["month_sin"] = np.sin(2 * np.pi * m / 12)
    cal["month_cos"] = np.cos(2 * np.pi * m / 12)
    cal["maha"] = m.isin([10, 11, 12, 1, 2, 3]).astype(int)
    return cal


def build_features(prices: pd.DataFrame, rain: pd.DataFrame | None, horizon: int = HORIZON) -> pd.DataFrame:
    df = _price_features(prices)
    df = _target(df, horizon)
    df["region"] = df["item_key"].map(lambda k: ITEMS_BY_KEY[k].region if k in ITEMS_BY_KEY else None)
    if rain is not None:
        df = df.merge(rain, on=["obs_date", "region"], how="left")
    else:
        for c in RAIN_FEATURES:
            df[c] = np.nan
    df = df.merge(_calendar(df["obs_date"]), on="obs_date", how="left")
    for c in CAT_FEATURES:
        df[c] = df[c].astype("category")
    return df


def weather_inputs(conn) -> pd.DataFrame | None:
    from mila.weather import climatology, load_daily_rain, region_rain

    daily = load_daily_rain(conn)
    if daily.empty:
        return None
    reg = region_rain(daily)
    full_idx = pd.date_range(reg.index.min(), max(reg.index.max(), pd.Timestamp(date.today())), freq="D")
    reg = reg.reindex(full_idx)
    return rain_table(reg, climatology(reg, 7), climatology(reg, 30))
