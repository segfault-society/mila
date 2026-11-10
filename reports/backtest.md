# Mila backtest scorecard

Generated 2026-11-10 11:53 UTC from the live database. Rolling origin: refit every
3 months from 2019-01-01; each origin only sees outcomes known before it; ranges calibrated on the
preceding 180 days (CQR). Validation period 2019-01-01 to 2024-01-01 (used only to pick the spike threshold);
**hold-out 2024-01-01 onwards** (all numbers below are hold-out unless stated).

Forecast rows per year: 2019: 18,563, 2020: 20,300, 2021: 24,808, 2022: 30,148, 2023: 31,816, 2024: 31,286, 2025: 30,775, 2026: 26,726.
Hold-out rows: 88,787 (7-day forecasts for every item, market and price type).

## Is the central forecast useful?

| Model | MAE of 7-day log change |
|---|---|
| Mila (LightGBM median) | 0.0953 |
| Persistence (no change) | 0.0994 |
| Seasonal naive (same week last year), on rows where it exists | 0.1497 (Mila on the same rows: 0.0980) |

MASE vs persistence: **0.959** (target < 1).

## Are the ranges honest?

| Interval | Coverage of the 80% range (target 77-83%) |
|---|---|
| Mila, calibrated (CQR) | **80.4%** |
| Mila, before calibration | 78.4% |
| Unconditional per-item range (baseline) | 82.2% |

Lowest item coverage: nadu_imp at 72.3%.
Mean pinball loss: Mila 0.0314 vs baseline 0.0345.

## Does it catch spikes? (rise of 25%+ within 7 days; hold-out spike rate 7.3%)

| Method | Precision | Recall | F1 | Warnings | Actual spikes |
|---|---|---|---|---|---|
| Mila, direct classifier, best validation F1 (threshold 0.15) | 31.1% | 58.4% | 0.406 | 12100 | 6439 |
| Mila, from calibrated distribution, best validation F1 (threshold 0.20) | 31.4% | 53.4% | 0.395 | 10962 | 6439 |
| Mila, direct classifier, precision >= 60% on validation (threshold 0.62) | 66.5% | 5.5% | 0.102 | 534 | 6439 |
| Mila, from distribution, precision >= 60% on validation (threshold 0.47) | 61.8% | 4.7% | 0.087 | 489 | 6439 |
| Last week's trend rule (rose 10%+ last week) | 10.6% | 26.2% | 0.150 | 15968 | 6439 |
| Rainfall rule (7-day rain 2x normal in growing area) | 12.4% | 17.6% | 0.146 | 9107 | 6439 |

Live system uses: **direct classifier** at threshold
0.15: the method and threshold with the best F1 on the 2019-2023 validation period (never chosen
on the hold-out).

Precision/recall trade-off of the direct classifier on the hold-out (for owners who prefer fewer, surer warnings):

| Threshold | Precision | Recall | F1 | Warnings |
|---|---|---|---|---|
| 0.10 | 25.1% | 72.9% | 0.374 | 18683 |
| 0.15 | 31.1% | 58.4% | 0.406 | 12100 |
| 0.20 | 36.1% | 47.5% | 0.410 | 8466 |
| 0.25 | 40.1% | 37.4% | 0.387 | 6009 |
| 0.30 | 43.6% | 29.2% | 0.350 | 4320 |
| 0.40 | 50.8% | 18.3% | 0.269 | 2320 |
| 0.50 | 57.9% | 10.8% | 0.182 | 1198 |
| 0.60 | 64.1% | 6.4% | 0.117 | 644 |

## Does abstaining help?

Mila abstained on 2.9% of hold-out forecasts. Median-forecast error where it answered:
0.0912; where it abstained: 0.2313. Coverage where it answered:
80.4%.

## Does weather matter? (ablation: same model without rainfall features)

| Items | MAE with weather | MAE without weather | Spike F1 with | Spike F1 without |
|---|---|---|---|---|
| Up-country vegetables | 0.1603 | 0.1652 | 0.444 | 0.394 |
| Dry-zone crops | 0.1170 | 0.1178 | 0.416 | 0.409 |
| All items | 0.0953 | 0.0964 | 0.406 | 0.388 |

## Case study: Cyclone Ditwah (late November 2025)

| Date | Item | Actual 7-day change | Forecast median | 80% range | Spike chance | Abstained |
|---|---|---|---|---|---|---|
| 10 Nov | beans | +67% | -4% | -39% to +32% | 11% | no |
| 10 Nov | cabbage | +0% | -1% | -24% to +35% | 19% | no |
| 10 Nov | carrot | +33% | +10% | -28% to +64% | 30% | no |
| 10 Nov | tomato | +25% | +3% | -25% to +61% | 32% | no |
| 13 Nov | beans | +33% | -3% | -32% to +30% | 14% | no |
| 13 Nov | cabbage | +0% | +7% | -21% to +46% | 26% | no |
| 13 Nov | carrot | -17% | -5% | -36% to +46% | 6% | no |
| 13 Nov | tomato | +10% | +0% | -30% to +74% | 34% | no |
| 17 Nov | beans | +0% | -9% | -37% to +10% | 4% | no |
| 17 Nov | cabbage | +0% | -4% | -30% to +28% | 9% | no |
| 17 Nov | carrot | -25% | -10% | -39% to +32% | 4% | no |
| 17 Nov | tomato | +50% | +4% | -31% to +93% | 46% | no |
| 20 Nov | beans | +50% | +1% | -23% to +19% | 8% | no |
| 20 Nov | cabbage | +40% | -3% | -30% to +30% | 11% | no |
| 20 Nov | carrot | +87% | +3% | -28% to +50% | 12% | no |
| 20 Nov | tomato | +82% | +2% | -29% to +71% | 44% | no |
| 24 Nov | beans | +140% | +5% | -23% to +31% | 13% | no |
| 24 Nov | cabbage | +200% | +3% | -22% to +36% | 13% | no |
| 24 Nov | carrot | +300% | +2% | -30% to +52% | 15% | no |
| 24 Nov | tomato | +100% | +3% | -32% to +54% | 25% | no |
| 27 Nov | beans | +17% | +1% | -25% to +33% | 31% | no |
| 27 Nov | cabbage | +7% | -6% | -31% to +27% | 9% | no |
| 27 Nov | carrot | +25% | -5% | -45% to +43% | 7% | no |
| 27 Nov | tomato | +25% | -1% | -36% to +59% | 22% | no |
| 01 Dec | beans | -17% | -6% | -46% to +23% | 15% | yes |
| 01 Dec | cabbage | -67% | -6% | -42% to +26% | 9% | yes |
| 01 Dec | carrot | -75% | -2% | -47% to +46% | 8% | yes |
| 01 Dec | tomato | -17% | -2% | -43% to +62% | 30% | yes |
| 08 Dec | beans | -30% | -4% | -33% to +17% | 5% | no |
| 08 Dec | cabbage | +100% | +37% | -6% to +124% | 91% | yes |
| 08 Dec | carrot | +33% | +28% | -15% to +108% | 62% | no |
| 08 Dec | tomato | +60% | +2% | -32% to +66% | 21% | no |
| 11 Dec | beans | -38% | +5% | -24% to +25% | 27% | no |
| 11 Dec | cabbage | +47% | +8% | -19% to +47% | 21% | no |
| 11 Dec | carrot | +33% | +17% | -16% to +95% | 59% | yes |
| 11 Dec | tomato | +80% | +7% | -29% to +63% | 33% | no |
| 15 Dec | beans | +0% | +6% | -28% to +42% | 18% | no |
| 15 Dec | cabbage | +25% | +2% | -27% to +36% | 22% | no |
| 15 Dec | carrot | +0% | +4% | -32% to +56% | 13% | no |
| 15 Dec | tomato | +37% | +3% | -42% to +52% | 31% | no |
| 18 Dec | beans | +100% | +7% | -21% to +41% | 30% | no |
| 18 Dec | cabbage | +14% | +7% | -21% to +37% | 21% | no |
| 18 Dec | carrot | +0% | +7% | -27% to +61% | 21% | no |
| 18 Dec | tomato | +56% | +8% | -39% to +54% | 28% | no |

Spike days in this window (Pettah wholesale, 4 up-country/dry-zone vegetables): 54; warned at the live threshold (0.15): 38 (70%). The forecast medians, though, stayed far below the actual rises.

## Limits

- The 2024-2026 hold-out is one period; the 2022 crisis sits in the validation/training years.
- Spike warnings are only issued for items with at least 12 spikes in their training history.
- SARIMAX, LSTM and the money-saved simulation from the proposal were not run in this build.
