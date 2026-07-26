import assert from "node:assert/strict";
import test from "node:test";

import {
  parseReadinessBudget,
  readinessBudgetError,
  requiredRequestFailureError,
} from "../../e2e/support/readiness";

test("readiness slow budget defaults to 15 seconds and is configurable", () => {
  assert.equal(parseReadinessBudget(undefined), 15_000);
  assert.equal(parseReadinessBudget("12000"), 12_000);
});

test("declared page and API requests fail readiness on transport errors or 5xx", () => {
  assert.equal(requiredRequestFailureError(
    "hr-roster",
    ["/workspace/hr/roster", "/workspace/api/modules/hr/roster/employees"],
    [{ error: "optional", method: "GET", url: "http://127.0.0.1/optional" }],
    [],
  ), null);
  assert.match(requiredRequestFailureError(
    "hr-roster",
    ["/workspace/api/modules/hr/roster/employees"],
    [],
    [{ method: "GET", status: 503, url: "http://127.0.0.1/workspace/api/modules/hr/roster/employees" }],
  )?.message ?? "", /required request failed/);
});

test("readiness slow budget cannot exceed the diagnostic hard timeout", () => {
  for (const value of ["0", "3.5", "30001", "not-a-budget"]) {
    assert.throws(() => parseReadinessBudget(value), /E2E_READY_SLOW_BUDGET_MS/);
  }
});

test("readiness budget fails only after the configured boundary", () => {
  assert.equal(readinessBudgetError("work-home", 15_000, 15_000), null);
  assert.match(
    readinessBudgetError("work-home", 15_001, 15_000)?.message ?? "",
    /exceeding the 15000ms slow budget/,
  );
});
