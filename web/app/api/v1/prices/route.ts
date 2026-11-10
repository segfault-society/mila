import {
  apiPrices,
  csvResponse,
  handler,
  jsonResponse,
  parseFormat,
  parseItems,
  parseMarket,
  parseRange,
  parseType,
  preflight,
  ROW_LIMIT,
} from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/v1/prices?item=&market=&type=&from=&to=&format=: daily CBSL prices, newest first. */
export const GET = handler(async (req) => {
  const format = parseFormat(req);
  const market = parseMarket(req);
  const type = parseType(req);
  const { from, to } = parseRange(req);
  const items = await parseItems(req);

  const { rows, truncated, nextTo } = await apiPrices(from, to, items, market, type);

  if (format === "csv") {
    return csvResponse(
      `mila-prices-${from}-to-${to}.csv`,
      ["date", "item", "market", "type", "price_lkr", "unit"],
      rows.map((r) => [r.date, r.item, r.market, r.type, r.price, r.unit]),
    );
  }

  let next: string | null = null;
  if (nextTo) {
    const u = new URL(req.nextUrl);
    u.searchParams.set("from", from);
    u.searchParams.set("to", nextTo);
    next = u.toString();
  }
  return jsonResponse(rows, {
    count: rows.length,
    query: { item: items, market, type, from, to },
    currency: "LKR",
    order: "newest first",
    row_limit: ROW_LIMIT,
    truncated,
    ...(truncated
      ? {
          truncated_note: `More than ${ROW_LIMIT.toLocaleString("en")} rows matched. Only whole days are returned; request again with to=${nextTo} (meta.next) for older rows, or narrow the query.`,
          next,
        }
      : {}),
  });
});

export const OPTIONS = preflight;
