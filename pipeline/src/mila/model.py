"""Quantile LightGBM + conformalized quantile regression (CQR) + spike probability + abstention.

Pooled across items (item is a categorical feature) so scarce spikes in one vegetable help the others.
CQR (Romano et al. 2019): on a calibration window, score E = max(q10 - y, y - q90); widen [q10, q90] by the
(1-alpha) empirical quantile of E, per item when the item has enough calibration rows, pooled otherwise.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import lightgbm as lgb
import numpy as np
import pandas as pd

from mila.features import CAT_FEATURES, FEATURES, RAIN_FEATURES, SPIKE

QUANTILES = (0.1, 0.5, 0.9)
ALPHA = 0.2  # 80% interval
MIN_CAL_PER_ITEM = 80
WIDTH_RELATIVE = 1.6  # a range 1.6x wider than usual for the item is too wide to act on
WIDTH_ABSOLUTE = math.log(3.0)  # ... and any 80% range spanning more than x3 always is
MIN_SPIKES_FOR_WARNINGS = 12
PARAMS = dict(n_estimators=300, learning_rate=0.05, num_leaves=31, min_child_samples=40, subsample=0.8,
              subsample_freq=1, colsample_bytree=0.8, verbose=-1, n_jobs=-1, random_state=7)


def _norm_cdf(x: np.ndarray) -> np.ndarray:
    return 0.5 * (1 + np.vectorize(math.erf)(x / math.sqrt(2)))


@dataclass
class Model:
    features: list[str]
    quantile_models: dict[float, lgb.LGBMRegressor] = field(default_factory=dict)
    spike_model: lgb.LGBMClassifier | None = None
    q_adjust: dict[str, float] = field(default_factory=dict)  # per item CQR widening (log units)
    q_adjust_pooled: float = 0.0
    typical_width: dict[str, float] = field(default_factory=dict)  # median calibrated 80% width per item
    feature_ranges: dict[str, tuple[float, float]] = field(default_factory=dict)
    spike_counts: dict[str, int] = field(default_factory=dict)
    spike_threshold: float = 0.5
    spike_source: str = "classifier"  # classifier | distribution

    def fit(self, df: pd.DataFrame) -> Model:
        d = df[df["y"].notna()]
        X, y = d[self.features], d["y"]
        for q in QUANTILES:
            m = lgb.LGBMRegressor(objective="quantile", alpha=q, **PARAMS)
            m.fit(X, y, categorical_feature=[c for c in CAT_FEATURES if c in self.features])
            self.quantile_models[q] = m
        self.spike_model = lgb.LGBMClassifier(objective="binary", **PARAMS)
        self.spike_model.fit(X, d["spike"].astype(int), categorical_feature=[c for c in CAT_FEATURES
                                                                             if c in self.features])
        for c in ("ret_5", "ret_20", "vol_20", "lvl_60"):
            if c in d:
                self.feature_ranges[c] = (float(d[c].quantile(0.002)), float(d[c].quantile(0.998)))
        self.spike_counts = d.groupby("item_key", observed=True)["spike"].sum().astype(int).to_dict()
        return self

    def raw_predict(self, df: pd.DataFrame) -> pd.DataFrame:
        X = df[self.features]
        out = pd.DataFrame(index=df.index)
        for q, m in self.quantile_models.items():
            out[f"q{int(q * 100)}"] = m.predict(X)
        # quantile crossing guard
        qs = np.sort(out[["q10", "q50", "q90"]].to_numpy(), axis=1)
        out["q10"], out["q50"], out["q90"] = qs[:, 0], qs[:, 1], qs[:, 2]
        out["p_spike_clf"] = self.spike_model.predict_proba(X)[:, 1]
        return out

    def calibrate(self, df_cal: pd.DataFrame) -> Model:
        d = df_cal[df_cal["y"].notna()]
        p = self.raw_predict(d)
        score = np.maximum(p["q10"] - d["y"], d["y"] - p["q90"])

        def conformal_q(s: pd.Series) -> float:
            n = len(s)
            level = min(1.0, math.ceil((n + 1) * (1 - ALPHA)) / n)
            return float(np.quantile(s, level))

        self.q_adjust_pooled = conformal_q(score)
        for item, s in score.groupby(d["item_key"], observed=True):
            if len(s) >= MIN_CAL_PER_ITEM:
                self.q_adjust[str(item)] = conformal_q(s)
        adj = d["item_key"].astype(str).map(self.q_adjust).fillna(self.q_adjust_pooled)
        width = (p["q90"] - p["q10"]) + 2 * adj
        self.typical_width = width.groupby(d["item_key"].astype(str)).median().to_dict()
        return self

    def predict(self, df: pd.DataFrame) -> pd.DataFrame:
        p = self.raw_predict(df)
        adj = df["item_key"].astype(str).map(self.q_adjust).fillna(self.q_adjust_pooled).to_numpy()
        p["q10"] = p["q10"] - adj
        p["q90"] = p["q90"] + adj
        # spike probability read off the calibrated distribution (split normal through q10/q50/q90)
        z = 1.2816
        up = np.maximum((p["q90"] - p["q50"]) / z, 1e-4)
        down = np.maximum((p["q50"] - p["q10"]) / z, 1e-4)
        sigma = np.where(SPIKE >= p["q50"], up, down)
        p["p_spike_dist"] = 1 - _norm_cdf((SPIKE - p["q50"].to_numpy()) / sigma)
        p["spike_prob"] = p["p_spike_clf"] if self.spike_source == "classifier" else p["p_spike_dist"]
        return p

    def abstain_reasons(self, df: pd.DataFrame, pred: pd.DataFrame, data_date: pd.Timestamp | None = None,
                        stale_days: int = 4) -> pd.Series:
        """Plain-language reason to stay silent, or None."""
        reasons = pd.Series([None] * len(df), index=df.index, dtype=object)
        width = pred["q90"] - pred["q10"]
        usual = df["item_key"].astype(str).map(self.typical_width).astype(float).fillna(width.median())
        too_wide = (width > WIDTH_RELATIVE * usual) | (width > WIDTH_ABSOLUTE)
        reasons[too_wide] = "range too wide to act on this week"
        for c, (lo, hi) in self.feature_ranges.items():
            out = (df[c] < lo) | (df[c] > hi)
            reasons[out & reasons.isna()] = "prices are moving outside anything Mila has seen"
        if data_date is not None:
            stale = (data_date - df["obs_date"]).dt.days > stale_days
            reasons[stale] = "no recent price from CBSL"
        no_hist = df["ret_20"].isna()
        reasons[no_hist & reasons.isna()] = "not enough recent history"
        return reasons

    def signals(self, df: pd.DataFrame, pred: pd.DataFrame, reasons: pd.Series) -> pd.Series:
        spikes_known = df["item_key"].astype(str).map(self.spike_counts).fillna(0) >= MIN_SPIKES_FOR_WARNINGS
        sig = np.where(pred["q50"] >= math.log(1.05), "rise",
                       np.where(pred["q50"] <= math.log(0.95), "fall", "steady"))
        sig = np.where((pred["spike_prob"] >= self.spike_threshold) & spikes_known, "spike", sig)
        sig = np.where(reasons.notna(), "no_forecast", sig)
        return pd.Series(sig, index=df.index)


def feature_list(with_weather: bool = True) -> list[str]:
    return [f for f in FEATURES if with_weather or f not in RAIN_FEATURES]


def fit_calibrated(df: pd.DataFrame, cal_days: int = 180, with_weather: bool = True,
                   spike_source: str = "classifier", spike_threshold: float = 0.5) -> Model:
    """Fit on everything before the calibration window, calibrate on the window, refit on all, keep the CQR."""
    d = df[df["y"].notna()]
    span = (d["obs_date"].max() - d["obs_date"].min()).days
    cal_days = max(21, min(cal_days, span // 3))  # short histories: calibrate on the most recent third
    cut = d["obs_date"].max() - pd.Timedelta(days=cal_days)
    first = Model(feature_list(with_weather)).fit(d[d["fut_date"] < cut])
    first.calibrate(d[d["obs_date"] >= cut])
    final = Model(feature_list(with_weather)).fit(d)
    final.q_adjust, final.q_adjust_pooled = first.q_adjust, first.q_adjust_pooled
    final.typical_width = first.typical_width
    final.spike_source, final.spike_threshold = spike_source, spike_threshold
    return final
