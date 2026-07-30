import assert from "node:assert/strict";
import test from "node:test";

import { hasBlockingSourceCodeAnalysisDiagnostics } from "./cli";

test("dependency cycles block source-code-analysis check", () => {
  const snapshot = {
    summary: {
      unclassifiedFileCount: 0,
      ambiguousFileCount: 0,
      missingInterfaceCount: 0,
      dependencyCycleCount: 1,
      mixedResponsibilityFileCount: 0,
    },
  };

  assert.equal(hasBlockingSourceCodeAnalysisDiagnostics(snapshot), true);
});

test("unresolved mixed responsibilities block source-code-analysis check", () => {
  const snapshot = {
    summary: {
      unclassifiedFileCount: 0,
      ambiguousFileCount: 0,
      missingInterfaceCount: 0,
      dependencyCycleCount: 0,
      mixedResponsibilityFileCount: 1,
    },
  };

  assert.equal(hasBlockingSourceCodeAnalysisDiagnostics(snapshot), true);
});
