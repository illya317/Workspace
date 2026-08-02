import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  marketStockCatalogCacheDirectory,
  readMarketStockCatalogCache,
  writeMarketStockCatalogCache,
} from "./market-stock-catalog-cache";

test("resolves the stock catalog beside persistent market history", () => {
  assert.equal(
    marketStockCatalogCacheDirectory({ WORKSPACE_CONFIG_DIR: "/workspace-runtime" }),
    "/workspace-runtime/cache/capital-securities/market-intelligence/catalog",
  );
});

test("persists stale stock catalogs so searches can use stale-while-revalidate", async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "market-stock-catalog-"));
  const record = {
    updatedAt: "2026-07-30T00:00:00.000Z",
    expiresAt: 2_000,
    items: [{ market: "CN" as const, symbol: "600036", name: "招商银行", sourceLabel: "test" }],
  };
  try {
    assert.equal(await writeMarketStockCatalogCache(record, { cacheDir }), true);
    assert.deepEqual(await readMarketStockCatalogCache({ cacheDir }), record);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});
