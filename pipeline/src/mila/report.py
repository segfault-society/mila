"""Write the evaluation scorecard (reports/backtest.md) and store per-item scores for the dashboard."""

from __future__ import annotations

import json
import math
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
import psycopg

from mila.backtest import per_item_scores, run_backtest, spike_score, summarise
from mila.features import build_features, load_prices, weather_inputs


def _pct(x: float) -> str:
    return "n/a" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x * 100:.1f}%"


def _f(x: float, d: int = 4) -> str:
    return "n/a" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.{d}f}"


def _spike_row(name: str, s: dict) -> str:
    return (f"| {name} | {_pct(s['precision'])} | {_pct(s['recall'])} | {_f(s['f1'], 3)} | {s['n_pred']} "
            f"| {s['n_true']} |")


def _ditwah(res: pd.DataFrame) -> str:
    """Cyclone Ditwah (late Nov 2025): what Mila said for up-country vegetables in the weeks around it."""
    w = res[(res["obs_date"] >= "2025-11-10") & (res["obs_date"] <= "2025-12-20")
            & res["item_key"].isin(["carrot", "beans", "cabbage", "tomato"])
            & (res["market"] == "pettah") & (res["price_type"] == "wholesale")]
    if w.empty:
        return "_No backtest rows in the Ditwah window yet (archive still loading when this report was written)._"
    lines = ["| Date | Item | Actual 7-day change | Forecast median | 80% range | Spike chance | Abstained |",
             "|---|---|---|---|---|---|---|"]
    for _, r in w[w["obs_date"].dt.dayofweek.isin([0, 3])].iterrows():
        pc = lambda v: f"{(math.exp(v) - 1) * 100:+.0f}%"  # noqa: E731
        lines.append(f"| {r['obs_date']:%d %b} | {r['item_key']} | {pc(r['y'])} | {pc(r['q50'])} | "
                     f"{pc(r['q10'])} to {pc(r['q90'])} | {r['p_spike_clf'] * 100:.0f}% | "
                     f"{'yes' if r['abstain'] else 'no'} |")
    hit = w[w["spike"] == 1]
    warned = int(((hit["p_spike_clf"] >= 0.5) & ~hit["abstain"]).sum())
    lines.append(f"\nSpike days in this window (Pettah wholesale, 4 up-country/dry-zone vegetables): {len(hit)}; "
                 f"warned at a 50% threshold: {warned}.")
    return "\n".join(lines)


def write_backtest_report(conn: psycopg.Connection, start: str, holdout: str, step_months: int,
                          ablation: bool, out_dir: str) -> Path:
    prices = load_prices(conn)
    df = build_features(prices, weather_inputs(conn))
    conn.rollback()  # end the read transaction: Neon drops connections left idle in a transaction
    res = run_backtest(df, start=start, step_months=step_months)
    res.to_pickle(Path(out_dir).parent / "data" / "backtest_res.pkl")
    s = summarise(res, holdout)
    clf, dist = s["spike_p_spike_clf"], s["spike_p_spike_dist"]
    clf_f1, dist_f1 = s["spike_p_spike_clf_f1"], s["spike_p_spike_dist_f1"]
    # live operating point: the method and threshold with the best F1 on the VALIDATION period
    use_clf = clf_f1["val_f1"] >= dist_f1["val_f1"]
    best = clf_f1 if use_clf else dist_f1
    col = "p_spike_clf" if use_clf else "p_spike_dist"

    abl_txt = "_Ablation skipped._"
    if ablation:
        res_nw = run_backtest(df, start=start, step_months=step_months, with_weather=False)
        hold_w = res[res["obs_date"] >= holdout]
        hold_nw = res_nw[res_nw["obs_date"] >= holdout]
        rows = ["| Items | MAE with weather | MAE without weather | Spike F1 with | Spike F1 without |",
                "|---|---|---|---|---|"]
        for label, mask_fn in (("Up-country vegetables", lambda f: f["region"] == "upcountry"),
                               ("Dry-zone crops", lambda f: f["region"] == "dryzone"),
                               ("All items", lambda f: f["region"].notna() | f["region"].isna())):
            a, b = hold_w[mask_fn(hold_w)], hold_nw[mask_fn(hold_nw)]
            fa = spike_score((a[col] >= best["threshold"]) & a["spikes_known"], a["spike"] == 1).f1
            fb = spike_score((b[col] >= best["threshold"]) & b["spikes_known"], b["spike"] == 1).f1
            rows.append(f"| {label} | {_f((a['y'] - a['q50']).abs().mean())} | "
                        f"{_f((b['y'] - b['q50']).abs().mean())} | {_f(fa, 3)} | {_f(fb, 3)} |")
        abl_txt = "\n".join(rows)

    covered = res.groupby(res["obs_date"].dt.year)["obs_date"].count()
    md = f"""# Mila backtest scorecard

Generated {datetime.now(UTC):%Y-%m-%d %H:%M} UTC from the live database. Rolling origin: refit every
{step_months} months from {start}; each origin only sees outcomes known before it; ranges calibrated on the
preceding 180 days (CQR). Validation period {start} to {holdout} (used only to pick the spike threshold);
**hold-out {holdout} onwards** (all numbers below are hold-out unless stated).

Forecast rows per year: {", ".join(f"{y}: {n:,}" for y, n in covered.items())}.
Hold-out rows: {s['n_hold']:,} (7-day forecasts for every item, market and price type).

## Is the central forecast useful?

| Model | MAE of 7-day log change |
|---|---|
| Mila (LightGBM median) | {_f(s['mae_model'])} |
| Persistence (no change) | {_f(s['mae_persistence'])} |
| Seasonal naive (same week last year), on rows where it exists | {_f(s['mae_seasonal_naive'])} (Mila on the same rows: {_f(s['mae_model_on_sn_rows'])}) |

MASE vs persistence: **{_f(s['mase'], 3)}** (target < 1).

## Are the ranges honest?

| Interval | Coverage of the 80% range (target 77-83%) |
|---|---|
| Mila, calibrated (CQR) | **{_pct(s['coverage_calibrated'])}** |
| Mila, before calibration | {_pct(s['coverage_uncalibrated'])} |
| Unconditional per-item range (baseline) | {_pct(s['coverage_baseline'])} |

Lowest item coverage: {s['coverage_min_item'][0]} at {_pct(s['coverage_min_item'][1])}.
Mean pinball loss: Mila {_f(s['pinball_model'])} vs baseline {_f(s['pinball_baseline'])}.

## Does it catch spikes? (rise of 25%+ within 7 days; hold-out spike rate {_pct(s['spike_rate'])})

| Method | Precision | Recall | F1 | Warnings | Actual spikes |
|---|---|---|---|---|---|
{_spike_row(f"Mila, direct classifier, best validation F1 (threshold {clf_f1['threshold']:.2f})", clf_f1)}
{_spike_row(f"Mila, from calibrated distribution, best validation F1 (threshold {dist_f1['threshold']:.2f})", dist_f1)}
{_spike_row(f"Mila, direct classifier, precision >= 60% on validation (threshold {clf['threshold']:.2f})", clf)}
{_spike_row(f"Mila, from distribution, precision >= 60% on validation (threshold {dist['threshold']:.2f})", dist)}
{_spike_row("Last week's trend rule (rose 10%+ last week)", s['spike_trend_rule'])}
{_spike_row("Rainfall rule (7-day rain 2x normal in growing area)", s['spike_rain_rule'])}

Live system uses: **{'direct classifier' if use_clf else 'calibrated distribution'}** at threshold
{best['threshold']:.2f}: the method and threshold with the best F1 on the 2019-2023 validation period (never chosen
on the hold-out).

Precision/recall trade-off of the direct classifier on the hold-out (for owners who prefer fewer, surer warnings):

| Threshold | Precision | Recall | F1 | Warnings |
|---|---|---|---|---|
{chr(10).join(f"| {r['threshold']:.2f} | {_pct(r['precision'])} | {_pct(r['recall'])} | {_f(r['f1'], 3)} | {r['n_pred']} |" for r in s['spike_pr_curve'])}

## Does abstaining help?

Mila abstained on {_pct(s['abstain_rate'])} of hold-out forecasts. Median-forecast error where it answered:
{_f(s['mae_answered'])}; where it abstained: {_f(s['mae_abstained'])}. Coverage where it answered:
{_pct(s['coverage_answered'])}.

## Does weather matter? (ablation: same model without rainfall features)

{abl_txt}

## Case study: Cyclone Ditwah (late November 2025)

{_ditwah(res)}

## Limits

- The 2024-2026 hold-out is one period; the 2022 crisis sits in the validation/training years.
- Spike warnings are only issued for items with at least 12 spikes in their training history.
- SARIMAX, LSTM and the money-saved simulation from the proposal were not run in this build.
"""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    path = out / "backtest.md"
    path.write_text(md)
    (out / "backtest_summary.json").write_text(json.dumps(s, default=str, indent=2))

    scores = per_item_scores(res, holdout, best["threshold"], col)
    model_rows = [("_model", "spike_threshold", best["threshold"]),
                  ("_model", "spike_source_is_classifier", 1.0 if use_clf else 0.0),
                  ("_all", "coverage80", s["coverage_calibrated"]), ("_all", "mase", s["mase"]),
                  ("_all", "spike_precision", best["precision"]), ("_all", "spike_recall", best["recall"])]
    from mila.db import connect

    with connect() as w, w.cursor() as cur:  # fresh connection: the read one may have been closed while fitting
        cur.execute("delete from backtest_scores where run_label = 'latest'")
        cur.executemany("insert into backtest_scores (run_label, item_key, metric, value) values ('latest', %s, %s, %s)",
                        [(a, b, None if c is None or (isinstance(c, float) and math.isnan(c)) else float(c))
                         for a, b, c in list(scores.itertuples(index=False)) + model_rows])
        w.commit()
    return path
