import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCnbBuildTimingSummary,
  formatDurationMs,
  summarizeCnbBuildStatus,
} from "./cnb-build-timing-summary.mjs";

test("summarizes one CNB pipeline and identifies its slowest stage", () => {
  const summary = summarizeCnbBuildStatus({
    data: {
      pipelinesStatus: {
        "cnb-example-001": {
          duration: 310_000,
          stages: [
            { name: "Prepare", status: "success", duration: 5_000 },
            { name: "artifact.build", status: "success", duration: 222_000 },
            { name: "DebugDetection", status: "skipped", duration: 0 },
            { name: "server.deploy", status: "success", duration: 75_000 },
          ],
        },
      },
    },
  });

  assert.equal(summary.pipelineDurationMs, 310_000);
  assert.deepEqual(summary.stages.map((stage) => stage.name), ["Prepare", "artifact.build", "server.deploy"]);
  assert.equal(summary.slowestStage?.name, "artifact.build");
  assert.match(formatCnbBuildTimingSummary(summary), /CNB 最慢阶段\s+artifact\.build 3m 42s \(72%\)/);
});

test("formats millisecond, second, and minute durations", () => {
  assert.equal(formatDurationMs(900), "900ms");
  assert.equal(formatDurationMs(9_600), "10s");
  assert.equal(formatDurationMs(125_000), "2m 05s");
});

test("rejects missing or ambiguous pipeline timing", () => {
  assert.throws(() => summarizeCnbBuildStatus({}), /pipelinesStatus/);
  assert.throws(
    () => summarizeCnbBuildStatus({ data: { pipelinesStatus: { one: {}, two: {} } } }),
    /exactly one pipeline/,
  );
});
