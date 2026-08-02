import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { listDataQualityProviderResourceKeys } from "@workspace/platform/data-quality-provider-registry";

test("data-quality provider registry exposes the HR inspection resource", () => {
  assert.deepEqual(listDataQualityProviderResourceKeys(), ["hr.roster"]);
});

test("automatic inspection scheduler is enabled outside tests in both development and production", () => {
  const source = readFileSync(new URL("./data-quality-scheduler.ts", import.meta.url), "utf8");
  assert.match(source, /process\.env\.NODE_ENV !== "test"/);
  assert.doesNotMatch(source, /process\.env\.NODE_ENV !== "production"/);
});
