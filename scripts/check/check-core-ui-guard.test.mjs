import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { businessLifecycleNarrationLineNumbers } = require("./check-core-ui-guard.js");

test("core UI guard rejects ad hoc frozen-output narration", () => {
  assert.deepEqual(
    businessLifecycleNarrationLineNumbers([
      "createMessageSection(\"status\", {",
      "  content: `批次已发布，当前底稿基于冻结输出展示。`,",
      "});",
    ].join("\n")),
    [2],
  );
});

test("core UI guard allows standard lifecycle facts without narration", () => {
  assert.deepEqual(
    businessLifecycleNarrationLineNumbers('createStatusSection("status", { content: "已发布" });'),
    [],
  );
});
