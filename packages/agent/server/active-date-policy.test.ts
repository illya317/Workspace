import assert from "node:assert/strict";
import test from "node:test";

import {
  agentBusinessDate,
  isAgentDateOnlyRangeActive,
  isAgentDateTimeEndActive,
} from "./active-date-policy";

test("Agent lifecycle uses the configured business date", () => {
  assert.equal(agentBusinessDate(new Date("2026-07-15T12:00:00.000Z")), "2026-07-15");
});

test("position and department end dates include the whole business day", () => {
  const endDate = new Date("2026-07-16T00:00:00.000Z");
  assert.equal(isAgentDateTimeEndActive(endDate, "2026-07-16"), true);
  assert.equal(isAgentDateTimeEndActive(endDate, "2026-07-17"), false);
  assert.equal(isAgentDateTimeEndActive(null, "2026-07-17"), true);
});

test("EDP date-only ranges use the same inclusive business date", () => {
  assert.equal(isAgentDateOnlyRangeActive("2026-07-01", "2026-07-16", "2026-07-16"), true);
  assert.equal(isAgentDateOnlyRangeActive("2026-07-01", "2026-07-15", "2026-07-16"), false);
});
