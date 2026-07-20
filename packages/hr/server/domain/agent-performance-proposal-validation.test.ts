import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgentPerformanceSelfReviewCommand,
  parseStoredAgentPerformanceSelfReview,
} from "./agent-performance-proposal-validation";

test("performance Agent self review accepts a reviewed score and narrative", () => {
  const result = buildAgentPerformanceSelfReviewCommand({
    selfScore: 88,
    selfComment: "本周期完成重点目标，并依据任务和项目记录整理了可追溯的工作成果。",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.cycleId, null);
  assert.equal(result.data.selfScore, 88);
});

test("performance Agent self review rejects incomplete or invalid input", () => {
  const invalidScore = buildAgentPerformanceSelfReviewCommand({
    selfScore: 101,
    selfComment: "本周期完成重点目标，并依据任务和项目记录整理了可追溯的工作成果。",
  });
  const shortComment = buildAgentPerformanceSelfReviewCommand({ selfScore: 80, selfComment: "完成目标" });

  assert.equal(invalidScore.ok, false);
  assert.equal(shortComment.ok, false);
});

test("stored performance proposal requires an optimistic workflow snapshot", () => {
  const result = parseStoredAgentPerformanceSelfReview({
    employeeId: 3,
    okrCycleId: 8,
    selfScore: 86,
    selfComment: "本周期围绕部门目标完成工作，并保留了任务、汇报与结果记录作为事实依据。",
    expectedRequest: { id: 12, version: "invalid", status: "draft" },
  });

  assert.equal(result.ok, false);
});
