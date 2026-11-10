import { apiTrackRecord, handler, jsonResponse, METRIC_DEFINITIONS, preflight } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/v1/track-record: hold-out back-test (overall and per item) and live scores since launch. */
export const GET = handler(async () => {
  const record = await apiTrackRecord();
  return jsonResponse(record, { items: record.backtest.items.length, definitions: METRIC_DEFINITIONS });
});

export const OPTIONS = preflight;
