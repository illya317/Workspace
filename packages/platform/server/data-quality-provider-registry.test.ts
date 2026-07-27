import assert from "node:assert/strict";
import test from "node:test";

import { listDataQualityProviderResourceKeys } from "@workspace/platform/data-quality-provider-registry";
import { listDataQualityRoutingResourceOptions } from "./data-quality-policy";

test("data-quality routing only exposes producer-backed L2 resources", () => {
  assert.deepEqual(listDataQualityProviderResourceKeys(), ["hr.roster"]);
  assert.deepEqual(listDataQualityRoutingResourceOptions().map((option) => option.value), ["hr.roster"]);
});
