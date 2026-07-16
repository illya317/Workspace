import assert from "node:assert/strict";
import test from "node:test";

import { employeeWhereFromKey } from "./employee-profile-key";

test("employee profile keys preserve the existing numeric lookup rules", () => {
  assert.deepEqual(employeeWhereFromKey("00123"), { employeeId: "00123" });
  assert.deepEqual(employeeWhereFromKey("123"), { id: 123 });
});

test("employee profile keys support encoded non-numeric Agent employee IDs", () => {
  assert.deepEqual(employeeWhereFromKey("AI0001"), { employeeId: "AI0001" });
  assert.deepEqual(employeeWhereFromKey("%41%49%30%30%30%31"), { employeeId: "AI0001" });
});

test("employee profile keys reject malformed, empty, oversized, and control-character values", () => {
  assert.equal(employeeWhereFromKey("%E0%A4%A"), null);
  assert.equal(employeeWhereFromKey("%20%20"), null);
  assert.equal(employeeWhereFromKey("A".repeat(81)), null);
  assert.equal(employeeWhereFromKey("AI%0001"), null);
});
