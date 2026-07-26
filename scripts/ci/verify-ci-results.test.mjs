import assert from "node:assert/strict";
import test from "node:test";

import { verifyCiResults } from "./verify-ci-results.mjs";

const allJobs = { static: true, node: true, type: true, postgresql: true, build: true, e2e: true };
const allSuccess = {
  classify: "success",
  static: "success",
  node: "success",
  type: "success",
  postgresql: "success",
  build: "success",
  e2e: "success",
};

test("accepts exact expected successes and skips", () => {
  const expectations = { ...allJobs, postgresql: false, e2e: false };
  const results = { ...allSuccess, postgresql: "skipped", e2e: "skipped" };
  assert.equal(verifyCiResults({ expectations, results }).length, 6);
});

test("refuses a skipped required job", () => {
  assert.throws(
    () => verifyCiResults({ expectations: allJobs, results: { ...allSuccess, build: "skipped" } }),
    /build expected success but received skipped/,
  );
});

test("refuses a successful job that classification expected to skip", () => {
  assert.throws(
    () => verifyCiResults({ expectations: { ...allJobs, e2e: false }, results: allSuccess }),
    /e2e expected skipped but received success/,
  );
});

test("refuses missing or failed classification", () => {
  assert.throws(
    () => verifyCiResults({ expectations: allJobs, results: { ...allSuccess, classify: "failure" } }),
    /classification must succeed/,
  );
});
