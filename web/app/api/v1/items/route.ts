import { apiItems, handler, jsonResponse, MARKETS, preflight, PRICE_TYPES } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/v1/items: the item catalogue, with the market / price-type series each item has data for. */
export const GET = handler(async () => {
  const items = await apiItems();
  return jsonResponse(items, { count: items.length, markets: MARKETS, types: PRICE_TYPES });
});

export const OPTIONS = preflight;
