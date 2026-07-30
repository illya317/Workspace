import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  marketHistoryCacheDirectory,
  readMarketHistoryCache,
  writeMarketHistoryCache,
} from "./market-intelligence-cache";

test("resolves history cache below the persistent workspace runtime", () => {
  assert.equal(
    marketHistoryCacheDirectory({ WORKSPACE_CONFIG_DIR: "/workspace-runtime" }),
    "/workspace-runtime/cache/capital-securities/market-intelligence",
  );
  assert.equal(marketHistoryCacheDirectory({ MARKET_INTELLIGENCE_CACHE_DIR: "relative-cache" }), null);
});

test("persists fresh market history and removes expired entries", async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "market-history-cache-"));
  try {
    const rows = [{ date: "2026-07-30", open: 10, high: 12, low: 9, close: 11 }];
    assert.equal(await writeMarketHistoryCache("stock-a", rows, 2_000, { cacheDir }), true);
    assert.deepEqual(await readMarketHistoryCache("stock-a", { cacheDir, now: 1_000 }), { rows, expiresAt: 2_000 });
    assert.equal(await readMarketHistoryCache("stock-a", { cacheDir, now: 2_001 }), null);
    assert.deepEqual(await readdir(cacheDir), []);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});
