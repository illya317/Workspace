import assert from "node:assert/strict";
import test from "node:test";

import {
  rankAgentEmployeeCandidates,
  searchAgentEmployeeDirectory,
  type AgentEmployeeCandidate,
} from "./agent-employee-search";

const rows: AgentEmployeeCandidate[] = [
  { id: 1, employeeId: "EMP-X001", name: "测试员工甲全名", alias: '["示例别名"]', title: null, employments: [{ isActive: true }] },
  { id: 2, employeeId: "EMP-X002", name: "测试员工甲", alias: null, title: null, employments: [{ isActive: true }] },
  { id: 3, employeeId: "EMP-X003", name: "测试员工乙", alias: '["测试员工甲"]', title: null, employments: [{ isActive: false }] },
];

test("employee search ranks exact names ahead of prefixes and aliases", () => {
  assert.deepEqual(
    rankAgentEmployeeCandidates("测试员工甲", rows).map((item) => item.employeeId),
    ["EMP-X002", "EMP-X003", "EMP-X001"],
  );
});

test("employee search returns a bounded identifiable candidate set", () => {
  const many = Array.from({ length: 30 }, (_, index) => ({
    ...rows[0],
    id: index + 1,
    employeeId: `EMP-X${String(index + 1).padStart(3, "0")}`,
  }));
  const result = rankAgentEmployeeCandidates("测试", many, 20);
  assert.equal(result.length, 20);
  assert.ok(result.every((item) => item.name === "测试员工甲全名" && /^EMP-X\d{3}$/.test(item.employeeId)));
});

test("employee search refuses to turn an empty keyword into a full-roster query", async () => {
  assert.deepEqual(await searchAgentEmployeeDirectory("   "), { totalMatches: 0, items: [] });
});
