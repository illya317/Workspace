import assert from "node:assert/strict";
import test from "node:test";

import {
  marketStockSubscriptionId,
  normalizeCustomStock,
  normalizeStoredMarketSubscriptions,
  normalizeStoredMarketWatchlist,
} from "./market-intelligence-state";

test("restores only known local market subscriptions", () => {
  assert.deepEqual(
    normalizeStoredMarketSubscriptions('["a","missing","a","b"]', ["a", "b", "c"], ["c"]),
    ["a", "b"],
  );
});

test("falls back to defaults for invalid local subscription state", () => {
  assert.deepEqual(
    normalizeStoredMarketSubscriptions("not-json", ["a", "b"], ["b", "missing"]),
    ["b"],
  );
});

test("migrates the legacy watchlist and restores valid custom stocks", () => {
  assert.deepEqual(normalizeStoredMarketWatchlist(null, '["a","missing"]', ["a", "b"], ["b"]), {
    instrumentIds: ["a"],
    stocks: [],
  });
  assert.deepEqual(normalizeStoredMarketWatchlist(JSON.stringify({
    instrumentIds: ["b"],
    stocks: [{ market: "HK", symbol: "700", name: "腾讯" }, { market: "US", symbol: "bad ticker", name: "bad" }],
  }), null, ["a", "b"], ["a"]), {
    instrumentIds: ["b"],
    stocks: [{ market: "HK", symbol: "00700", name: "腾讯" }],
  });
});

test("normalizes user-entered symbols and stable subscription ids", () => {
  const stock = normalizeCustomStock({ market: "US", symbol: " brk.b.us ", name: " Berkshire Hathaway " });
  assert.deepEqual(stock, { market: "US", symbol: "BRK.B", name: "Berkshire Hathaway" });
  assert.equal(stock && marketStockSubscriptionId(stock), "us-stock-brk.b");
  assert.equal(normalizeCustomStock({ market: "CN", symbol: "123", name: "invalid" }), null);
});
