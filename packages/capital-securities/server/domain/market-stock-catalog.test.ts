import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeMarketStockCatalogs,
  normalizeAStockCatalog,
  normalizeHkStockCatalog,
  parseNasdaqTraderCatalog,
  searchMarketStockCatalogItems,
} from "./market-stock-catalog";

test("normalizes A-share and Hong Kong provider rows", () => {
  assert.deepEqual(normalizeAStockCatalog([
    { code: "600036", name: "招商银行" },
    { code: "bad", name: "无效" },
  ]), [{ market: "CN", symbol: "600036", name: "招商银行", sourceLabel: "AKShare A股代码表" }]);
  assert.deepEqual(normalizeHkStockCatalog([
    { "代码": "700", "中文名称": "腾讯控股" },
  ]), [{ market: "HK", symbol: "00700", name: "腾讯控股", sourceLabel: "AKShare 新浪港股" }]);
});

test("parses Nasdaq Trader directories and excludes ETFs and test issues", () => {
  const text = [
    "Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares",
    "AAPL|Apple Inc. - Common Stock|Q|N|N|100|N|N",
    "QQQ|Invesco QQQ Trust|G|N|N|100|Y|N",
    "ZTEST|Test Security|G|Y|N|100|N|N",
    "File Creation Time: 0731202621:32|||||||",
  ].join("\n");
  assert.deepEqual(parseNasdaqTraderCatalog(text), [{
    market: "US",
    symbol: "AAPL",
    name: "Apple Inc. - Common Stock",
    sourceLabel: "Nasdaq Trader Symbol Directory",
  }]);
});

test("deduplicates and searches the full catalog with exact symbols first", () => {
  const items = mergeMarketStockCatalogs([
    [{ market: "US", symbol: "AA", name: "Alcoa", sourceLabel: "one" }],
    [{ market: "US", symbol: "AAPL", name: "Apple", sourceLabel: "two" }],
    [{ market: "US", symbol: "AA", name: "Alcoa Corporation", sourceLabel: "two" }],
  ]);
  assert.equal(items.length, 2);
  assert.deepEqual(searchMarketStockCatalogItems({ items, query: "AA" }), {
    matchCount: 2,
    matches: [
      { market: "US", symbol: "AA", name: "Alcoa Corporation", sourceLabel: "two" },
      { market: "US", symbol: "AAPL", name: "Apple", sourceLabel: "two" },
    ],
  });
});
