import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTROL_OPTIONS,
  ENTRY_TYPE_OPTIONS,
} from "./consolidation-decision-presenters";

test("manual group adjustments have an entry label but no elimination control", () => {
  assert.deepEqual(
    ENTRY_TYPE_OPTIONS.find((option) => option.value === "groupAdjustment"),
    { value: "groupAdjustment", label: "集团调整" },
  );
  assert.equal(
    CONTROL_OPTIONS.some((option) => option.value === "elimination:groupAdjustment"),
    false,
  );
});
