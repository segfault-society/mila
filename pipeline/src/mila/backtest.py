"""Rolling-origin backtest against simple baselines. Every model change is scored the same way.

At each origin O the model only sees rows whose 7-day outcome was known before O (fut_date < O), is
calibrated on the last 180 days of that, and forecasts every trading day in [O, next origin).
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

from mila.model import Model, feature_list

log = logging.getLogger(__name__)
TREND_RULE = math.log(1.10)  # "it rose 10%+ last week, it will keep rising" - what owners do now
RAIN_RULE = 2.0  # 7-day rain at least twice the seasonal normal in the growing region
TARGET_PRECISION = 0.6


def _fit(train: pd.DataFrame, with_weather: bool, cal_days: int) -> Model:
    cut = train["obs_date"].max() - pd.Timedelta(days=cal_days)
    m = Model(feature_list(with_weather)).fit(train[train["fut_date"] < cut])
    return m.calibrate(train[train["obs_date"] >= cut])


def run_backtest(df: pd.DataFrame, start: str, end: str | None = None, step_months: int = 3,
                 with_weather: bool = True, cal_days: int = 180) -> pd.DataFrame:
    d = df[df["y"].notna()].copy()
    end_ts = pd.Timestamp(end) if end else d["obs_date"].max() + pd.Timedelta(days=1)
    origins = list(pd.date_range(start, end_ts, freq=f"{step_months}MS"))
    rows = []
    for o, nxt in zip(origins, origins[1:] + [end_ts], strict=True):
        train = d[d["fut_date"] < o]
        test = d[(d["obs_date"] >= o) & (d["obs_date"] < nxt)]
        if len(train) < 5000 or test.empty:
            continue
        m = _fit(train, with_weather, cal_days)
        raw = m.raw_predict(test)
        p = m.predict(test)
        reasons = m.abstain_reasons(test, p)
        base = train.groupby("item_key", observed=True)["y"].quantile([0.1, 0.9]).unstack()
        out = test[["obs_date", "item_key", "market", "price_type", "region", "y", "spike", "ret_5",
                    "rain_anom_7"]].copy()
        out[["q10", "q50", "q90", "p_spike_clf", "p_spike_dist"]] = p[["q10", "q50", "q90", "p_spike_clf",
                                                                      "p_spike_dist"]]
        out["raw_q10"], out["raw_q90"] = raw["q10"], raw["q90"]
        out["abstain"] = reasons.notna()
        out["spikes_known"] = test["item_key"].astype(str).map(m.spike_counts).fillna(0).to_numpy() >= 12
        out["base_q10"] = test["item_key"].map(base[0.1]).astype(float)
        out["base_q90"] = test["item_key"].map(base[0.9]).astype(float)
        out["origin"] = o
        rows.append(out)
        log.info("origin %s: train=%d test=%d", o.date(), len(train), len(test))
    res = pd.concat(rows, ignore_index=True)
    res["item_key"] = res["item_key"].astype(str)
    return _add_seasonal_naive(res, d)


def _add_seasonal_naive(res: pd.DataFrame, d: pd.DataFrame) -> pd.DataFrame:
    """Seasonal naive: the same series' 7-day change one year earlier."""
    hist = d[["obs_date", "item_key", "market", "price_type", "y"]].copy()
    for c in ("item_key", "market", "price_type"):
        hist[c] = hist[c].astype(str)
    hist = hist.rename(columns={"y": "sn_y", "obs_date": "sn_date"}).sort_values("sn_date")
    res = res.copy()
    for c in ("market", "price_type"):
        res[c] = res[c].astype(str)
    res["sn_date"] = res["obs_date"] - pd.Timedelta(days=364)
    res = pd.merge_asof(res.sort_values("sn_date"), hist, on="sn_date", by=["item_key", "market", "price_type"],
                        direction="backward", tolerance=pd.Timedelta(days=4))
    return res.sort_values(["obs_date", "item_key"]).reset_index(drop=True)


@dataclass
class SpikeScore:
    precision: float
    recall: float
    f1: float
    n_pred: int
    n_true: int


def spike_score(pred: pd.Series, truth: pd.Series) -> SpikeScore:
    pred, truth = pred.astype(bool), truth.astype(bool)
    tp = int((pred & truth).sum())
    n_pred, n_true = int(pred.sum()), int(truth.sum())
    precision = tp / n_pred if n_pred else float("nan")
    recall = tp / n_true if n_true else float("nan")
    f1 = 2 * precision * recall / (precision + recall) if n_pred and n_true and (precision + recall) else 0.0
    return SpikeScore(precision, recall, f1, n_pred, n_true)


def best_f1_threshold(val: pd.DataFrame, col: str) -> tuple[float, float]:
    """(threshold, validation F1) maximising F1 on the validation period."""
    best = (0.5, -1.0)
    for t in np.arange(0.05, 0.91, 0.025):
        f1 = spike_score((val[col] >= t) & val["spikes_known"], val["spike"] == 1).f1
        if f1 > best[1]:
            best = (float(t), f1)
    return best


def choose_threshold(val: pd.DataFrame, col: str) -> float:
    """Best F1 among thresholds reaching the target precision on the validation period (else best F1)."""
    best, best_any = (None, -1.0), (0.5, -1.0)
    for t in np.arange(0.1, 0.91, 0.025):
        s = spike_score((val[col] >= t) & val["spikes_known"], val["spike"] == 1)
        if s.f1 > best_any[1]:
            best_any = (float(t), s.f1)
        if not math.isnan(s.precision) and s.precision >= TARGET_PRECISION and s.f1 > best[1]:
            best = (float(t), s.f1)
    return best[0] if best[0] is not None else best_any[0]


def pinball(y: pd.Series, q: pd.Series, tau: float) -> float:
    diff = y - q
    return float(np.mean(np.maximum(tau * diff, (tau - 1) * diff)))


def summarise(res: pd.DataFrame, holdout_start: str) -> dict:
    """All headline numbers for the report, scored on the hold-out period only."""
    val = res[res["obs_date"] < holdout_start]
    hold = res[res["obs_date"] >= holdout_start]
    out: dict = {"n_val": len(val), "n_hold": len(hold), "holdout_start": holdout_start,
                 "period": (str(res["obs_date"].min().date()), str(res["obs_date"].max().date()))}
    ans = hold[~hold["abstain"]]
    mae = lambda e: float(np.mean(np.abs(e)))  # noqa: E731
    out["mae_model"] = mae(hold["y"] - hold["q50"])
    out["mae_persistence"] = mae(hold["y"])
    sn = hold.dropna(subset=["sn_y"])
    out["mae_seasonal_naive"] = mae(sn["y"] - sn["sn_y"])
    out["mae_model_on_sn_rows"] = mae(sn["y"] - sn["q50"])
    out["mase"] = out["mae_model"] / out["mae_persistence"]
    cov = lambda lo, hi, f: float(((f["y"] >= f[lo]) & (f["y"] <= f[hi])).mean())  # noqa: E731
    out["coverage_calibrated"] = cov("q10", "q90", hold)
    out["coverage_uncalibrated"] = cov("raw_q10", "raw_q90", hold)
    out["coverage_baseline"] = cov("base_q10", "base_q90", hold)
    out["coverage_answered"] = cov("q10", "q90", ans)
    per_item = hold.groupby("item_key").apply(lambda f: cov("q10", "q90", f), include_groups=False)
    out["coverage_min_item"] = (per_item.idxmin(), float(per_item.min()))
    out["pinball_model"] = np.mean([pinball(hold["y"], hold[c], t) for c, t in
                                    (("q10", 0.1), ("q50", 0.5), ("q90", 0.9))])
    out["pinball_baseline"] = np.mean([pinball(hold["y"], hold["base_q10"], 0.1), pinball(hold["y"], 0 * hold["y"], 0.5),
                                       pinball(hold["y"], hold["base_q90"], 0.9)])
    truth = hold["spike"] == 1
    out["spike_rate"] = float(truth.mean())
    for col in ("p_spike_clf", "p_spike_dist"):
        # two operating points, both chosen on the validation period only
        t = choose_threshold(val, col) if len(val) else 0.5
        s = spike_score((hold[col] >= t) & hold["spikes_known"], truth)
        out[f"spike_{col}"] = {"threshold": t, **s.__dict__}
        t_f1, val_f1 = best_f1_threshold(val, col) if len(val) else (0.5, float("nan"))
        s = spike_score((hold[col] >= t_f1) & hold["spikes_known"], truth)
        out[f"spike_{col}_f1"] = {"threshold": t_f1, "val_f1": val_f1, **s.__dict__}
    out["spike_pr_curve"] = [
        {"threshold": float(t), **spike_score((hold["p_spike_clf"] >= t) & hold["spikes_known"], truth).__dict__}
        for t in (0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6)]
    out["spike_trend_rule"] = spike_score(hold["ret_5"] >= TREND_RULE, truth).__dict__
    rain_ok = hold["region"].isin(["upcountry", "dryzone"])
    out["spike_rain_rule"] = spike_score(rain_ok & (hold["rain_anom_7"] >= RAIN_RULE), truth).__dict__
    out["abstain_rate"] = float(hold["abstain"].mean())
    out["mae_answered"] = mae(ans["y"] - ans["q50"])
    abst = hold[hold["abstain"]]
    out["mae_abstained"] = mae(abst["y"] - abst["q50"]) if len(abst) else float("nan")
    return out


def per_item_scores(res: pd.DataFrame, holdout_start: str, threshold: float, col: str) -> pd.DataFrame:
    hold = res[res["obs_date"] >= holdout_start]
    rows = []
    for item, f in hold.groupby("item_key"):
        s = spike_score((f[col] >= threshold) & f["spikes_known"], f["spike"] == 1)
        rows += [(item, "coverage80", float(((f["y"] >= f["q10"]) & (f["y"] <= f["q90"])).mean())),
                 (item, "mae_pct", float(np.mean(np.abs(np.exp(f["y"] - f["q50"]) - 1)) * 100)),
                 (item, "spike_precision", s.precision), (item, "spike_recall", s.recall),
                 (item, "n_forecasts", float(len(f))), (item, "n_spikes", float(s.n_true))]
    return pd.DataFrame(rows, columns=["item_key", "metric", "value"])
