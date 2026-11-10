import {
  apiLatestForecasts,
  csvResponse,
  handler,
  jsonResponse,
  parseFormat,
  parseMarket,
  parseType,
  preflight,
} from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/v1/forecasts/latest?market=&type=&format=: the newest forecast run and its 7-day forecasts. */
export const GET = handler(async (req) => {
  const format = parseFormat(req);
  const market = parseMarket(req);
  const type = parseType(req);
  const { run, rows } = await apiLatestForecasts(market, type);

  if (format === "csv") {
    return csvResponse(
      run ? `mila-forecasts-run-${run.id}.csv` : "mila-forecasts.csv",
      [
        "run_id",
        "data_date",
        "model_version",
        "item",
        "market",
        "type",
        "base_date",
        "base_price",
        "target_date",
        "q10",
        "q50",
        "q90",
        "spike_prob",
        "signal",
        "abstain_reason",
        "drivers",
      ],
      rows.map((f) => [
        run?.id,
        run?.data_date,
        run?.model_version,
        f.item,
        f.market,
        f.type,
        f.base_date,
        f.base_price,
        f.target_date,
        f.q10,
        f.q50,
        f.q90,
        f.spike_prob,
        f.signal,
        f.abstain_reason,
        f.drivers,
      ]),
    );
  }

  return jsonResponse(
    { run, forecasts: rows },
    {
      count: rows.length,
      query: { market, type },
      currency: "LKR",
      signals: {
        spike: "At least a 15% chance of a rise of 25% or more within 7 days (spike_prob).",
        rise: "Middle guess (q50) at least 5% above base_price.",
        steady: "Middle guess within 5% of base_price.",
        fall: "Middle guess at least 5% below base_price.",
        no_forecast: "Mila abstained; abstain_reason says why.",
      },
    },
  );
});

export const OPTIONS = preflight;
