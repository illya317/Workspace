import assert from "node:assert/strict";
import test from "node:test";

import { generatedDirectoryDisplayNames } from "./generated-document";

test("generated directory paths keep stable keys but expose Chinese names", () => {
  assert.deepEqual(generatedDirectoryDisplayNames("finance-report"), {
    generated: "系统生成",
    "generated/finance-report": "财务报表",
  });
  assert.deepEqual(generatedDirectoryDisplayNames("roster-due-diligence"), {
    generated: "系统生成",
    "generated/roster-due-diligence": "尽调版花名册",
  });
});
