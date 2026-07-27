import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { listDataQualityProviderResourceKeys } from "@workspace/platform/data-quality-provider-registry";
import { listDataQualityRoutingResourceOptions } from "./data-quality-policy";

test("data-quality routing only exposes producer-backed L2 resources", () => {
  assert.deepEqual(listDataQualityProviderResourceKeys(), ["hr.roster"]);
  assert.deepEqual(listDataQualityRoutingResourceOptions().map((option) => option.value), ["hr.roster"]);
});

test("automatic inspection scheduler is enabled outside tests in both development and production", () => {
  const source = readFileSync(new URL("./data-quality-scheduler.ts", import.meta.url), "utf8");
  assert.match(source, /process\.env\.NODE_ENV !== "test"/);
  assert.doesNotMatch(source, /process\.env\.NODE_ENV !== "production"/);
});
