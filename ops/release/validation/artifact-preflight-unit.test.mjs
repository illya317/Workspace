import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { inspectExactNextConfig } from "./artifact-preflight-unit.mjs";

const repository = path.resolve(import.meta.dirname, "../../..");

test("real Next loader enforces isolated release build caching for monolith and unit", async () => {
  const [monolith, news] = await Promise.all([
    inspectExactNextConfig({ repository, target: "monolith" }),
    inspectExactNextConfig({ repository, target: "news" }),
  ]);
  assert.deepEqual(monolith.filesystemCache, { development: "disabled", productionBuild: "enabled" });
  assert.deepEqual(news.filesystemCache, { development: "disabled", productionBuild: "enabled" });
  assert.equal(monolith.appRoot, ".");
  assert.equal(news.appRoot, "apps/news");
});
