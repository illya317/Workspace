import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentWorkItemUpdateDiff } from "./agent-work-item-proposal-diff";
import { parseAgentUpdateWorkItemInput } from "./agent-work-item-proposal-validation";

test("Work Agent confirmation diff records localized old and new values", () => {
  const diff = buildAgentWorkItemUpdateDiff({
    spaceName: "运营部",
    workId: 42,
    changes: {
      workId: 42,
      content: "新任务",
      status: "done",
      routineRecurrenceType: "weekly",
      isMilestone: true,
      ownerEmployeeId: 8,
      evidenceTaskIds: [20],
    },
    currentValues: {
      content: "旧任务",
      status: "active",
      routineRecurrenceType: "monthly",
      isMilestone: false,
      ownerEmployeeId: 7,
      evidenceTaskIds: [19],
    },
    currentReferenceLabels: {
      ownerEmployeeId: "张三 E007 (#7)",
      evidenceTaskIds: ["旧证据 (#19)"],
    },
    nextReferenceLabels: {
      ownerEmployeeId: "李四 E008 (#8)",
      evidenceTaskIds: ["新证据 (#20)"],
    },
  });

  assert.deepEqual(diff, {
    动作: "修改工作节点",
    空间: "运营部",
    工作节点ID: 42,
    字段变更: {
      内容: { 旧值: "旧任务", 新值: "新任务" },
      状态: { 旧值: "进行中", 新值: "已完成" },
      周期规则: { 旧值: "每月", 新值: "每周" },
      是否里程碑: { 旧值: "否", 新值: "是" },
      负责人: { 旧值: "张三 E007 (#7)", 新值: "李四 E008 (#8)" },
      KR任务证据: { 旧值: ["旧证据 (#19)"], 新值: ["新证据 (#20)"] },
    },
  });
});

test("Work Agent confirmation diff snapshots array labels instead of retaining mutable input", () => {
  const oldLabels = ["证据 A (#1)"];
  const nextLabels = ["证据 B (#2)"];
  const diff = buildAgentWorkItemUpdateDiff({
    spaceName: "个人空间",
    workId: 42,
    changes: { workId: 42, evidenceTaskIds: [2] },
    currentValues: { evidenceTaskIds: [1] },
    currentReferenceLabels: { evidenceTaskIds: oldLabels },
    nextReferenceLabels: { evidenceTaskIds: nextLabels },
  });
  oldLabels[0] = "被篡改";
  nextLabels[0] = "被篡改";

  assert.deepEqual(diff.字段变更.KR任务证据, {
    旧值: ["证据 A (#1)"],
    新值: ["证据 B (#2)"],
  });
});

test("Work Agent confirmation diff uses the normalized value that will be written", () => {
  const parsed = parseAgentUpdateWorkItemInput({ workId: 42, description: "  新说明  ", krUnit: "  %  " });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  const diff = buildAgentWorkItemUpdateDiff({
    spaceName: "个人空间",
    workId: 42,
    changes: parsed.data,
    currentValues: { description: "旧说明", krUnit: "项" },
    currentReferenceLabels: {},
    nextReferenceLabels: {},
  });

  assert.deepEqual(diff.字段变更, {
    说明: { 旧值: "旧说明", 新值: "新说明" },
    KR单位: { 旧值: "项", 新值: "%" },
  });
});

test("Work Agent confirmation diff uses standing-responsibility status semantics", () => {
  const diff = buildAgentWorkItemUpdateDiff({
    spaceName: "运营部",
    workId: 42,
    changes: { workId: 42, status: "done" },
    currentValues: { status: "active" },
    currentReferenceLabels: {},
    nextReferenceLabels: {},
    standingResponsibility: true,
  });

  assert.deepEqual(diff.字段变更.状态, { 旧值: "生效中", 新值: "已失效" });
});
