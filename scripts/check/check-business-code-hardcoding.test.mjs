import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyBusinessCodeLine,
  shouldScanFile,
} from "./check-business-code-hardcoding.mjs";

test("recognizes business code literals and generators", () => {
  assert.equal(classifyBusinessCodeLine('const categoryCode = "FA-ELECTRONIC";'), "coded-literal");
  assert.equal(
    classifyBusinessCodeLine("const projectCode = String(sequence).padStart(4, '0');", "packages/work/server/project-numbering.ts"),
    "code-construction",
  );
});

test("ignores ordinary strings and governed implementation files", () => {
  assert.equal(classifyBusinessCodeLine('const status = "READY-TO-RUN";'), null);
  assert.equal(shouldScanFile("packages/platform/business-code-rule.ts"), false);
  assert.equal(shouldScanFile("packages/finance/server/assets.ts"), true);
  assert.equal(shouldScanFile("packages/finance/server/assets.test.ts"), false);
});
