import assert from "node:assert/strict";
import test from "node:test";

import {
  rankAgentEmployeeCandidates,
  searchAgentEmployeeDirectory,
  type AgentEmployeeCandidate,
} from "./agent-employee-search";

const rows: AgentEmployeeCandidate[] = [
  { id: 1, employeeId: "00101", name: "张宇凡", alias: '["小张"]', title: null, employments: [{ isActive: true }] },
  { id: 2, employeeId: "00102", name: "张宇", alias: null, title: null, employments: [{ isActive: true }] },
  { id: 3, employeeId: "00103", name: "李明", alias: '["张宇"]', title: null, employments: [{ isActive: false }] },
];

test("employee search ranks exact names ahead of prefixes and aliases", () => {
  assert.deepEqual(
    rankAgentEmployeeCandidates("张宇", rows).map((item) => item.employeeId),
    ["00102", "00103", "00101"],
  );
});

test("employee search returns a bounded identifiable candidate set", () => {
  const many = Array.from({ length: 30 }, (_, index) => ({
    ...rows[0],
    id: index + 1,
    employeeId: String(index + 1).padStart(5, "0"),
  }));
  const result = rankAgentEmployeeCandidates("张", many, 20);
  assert.equal(result.length, 20);
  assert.ok(result.every((item) => item.name === "张宇凡" && /^\d{5}$/.test(item.employeeId)));
});

test("employee search refuses to turn an empty keyword into a full-roster query", async () => {
  assert.deepEqual(await searchAgentEmployeeDirectory("   "), { totalMatches: 0, items: [] });
});
