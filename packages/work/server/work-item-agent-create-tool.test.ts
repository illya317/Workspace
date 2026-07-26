import assert from "node:assert/strict";
import test from "node:test";

import { createWorkItemToolParameters } from "./work-item-agent-create-tool-contract";

test("Work Agent create tool requires an explicit parent reference", () => {
  assert.ok(createWorkItemToolParameters.required?.includes("parentWorkItemId"));
  assert.deepEqual(createWorkItemToolParameters.properties.parentWorkItemId, {
    type: ["integer", "null"],
    minimum: 1,
    description: "必须显式传入；目标传 null，KR 或任务传同一计划根目标的 WorkItem ID",
  });
  assert.deepEqual(createWorkItemToolParameters.properties.evidenceTaskIds, {
    type: "array",
    items: { type: "integer", minimum: 1 },
    uniqueItems: true,
    description: "仅 KR 可用；同一目标下作为结果证据的任务 WorkItem ID，可传空数组",
  });
});
