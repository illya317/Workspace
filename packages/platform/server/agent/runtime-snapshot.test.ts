import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentRuntimeAuditSnapshot } from "./runtime-snapshot";

test("runtime audit snapshot binds a run to immutable responsibility and capability evidence", () => {
  const snapshot = buildAgentRuntimeAuditSnapshot({
    id: 4,
    key: "synthetic.agent.profile",
    displayName: "示例提案助理",
    roleName: "AI查询与变更提案助理",
    responsibilities: "受控 Workspace 操作",
    allowedToolKeys: ["source.proposePullRequest", "source.searchWorkspaceCode"],
    runtime: {
      bindingId: 9,
      kind: "workspace",
      instructions: "仅在 Workspace 权限交集内执行。",
    },
    actorEmployeeId: "BOT-X004",
    actorEmployeeName: "示例提案助理",
  });

  assert.equal(snapshot.runtimeBindingId, 9);
  assert.match(snapshot.runtimeConfigJson ?? "", /"schemaVersion":2/);
  assert.match(snapshot.runtimeConfigJson ?? "", /"profileKey":"synthetic\.agent\.profile"/);
  assert.match(snapshot.runtimeConfigJson ?? "", /"displayName":"示例提案助理"/);
  assert.match(snapshot.runtimeConfigJson ?? "", /"roleName":"AI查询与变更提案助理"/);
  assert.match(snapshot.runtimeConfigJson ?? "", /"responsibilities":"受控 Workspace 操作"/);
  assert.match(snapshot.runtimeConfigJson ?? "", /"actorEmployeeId":"BOT-X004"/);
  assert.match(snapshot.runtimeConfigJson ?? "", /"actorEmployeeName":"示例提案助理"/);
  assert.match(snapshot.runtimeConfigJson ?? "", /仅在 Workspace 权限交集内执行/);
  assert.match(snapshot.runtimeConfigHash ?? "", /^[0-9a-f]{64}$/);
  assert.deepEqual(buildAgentRuntimeAuditSnapshot(null), {
    runtimeBindingId: null,
    runtimeConfigJson: null,
    runtimeConfigHash: null,
  });
});
