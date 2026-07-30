import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  SOURCE_CODE_ANALYSIS_SCHEMA_VERSION,
  type SourceCodeAnalysisSnapshot,
} from "../../../packages/platform/source-code-analysis-contract";
import {
  hasBlockingSourceCodeAnalysisDiagnostics,
  runSourceCodeAnalysis,
  writeSourceCodeAnalysisSnapshot,
} from "./cli";

function emptySnapshot(): SourceCodeAnalysisSnapshot {
  return {
    schemaVersion: SOURCE_CODE_ANALYSIS_SCHEMA_VERSION,
    generatedAt: "2026-07-30T00:00:00.000Z",
    sourceRevision: null,
    sourceDigest: "test",
    declarationMode: "central-manifest",
    lineMetric: "non-empty-non-comment-source-lines",
    summary: {
      fileCount: 0,
      lines: 0,
      declaredFileCount: 0,
      coveragePercent: 100,
      unclassifiedFileCount: 0,
      ambiguousFileCount: 0,
      missingInterfaceCount: 0,
      dependencyCycleCount: 0,
      dependencyFileCycleCount: 0,
      mixedResponsibilityFileCount: 0,
    },
    modules: [],
    dependencyEdges: [],
    reciprocalRoleDependencies: [],
    dependencyFileCycles: [],
    dependencyCycles: [],
    diagnostics: {
      unclassifiedFiles: [],
      ambiguousFiles: [],
      missingInterfaces: [],
      mixedResponsibilityFiles: [],
    },
  };
}

test("dependency cycles block source-code-analysis check", () => {
  const snapshot = {
    summary: {
      unclassifiedFileCount: 0,
      ambiguousFileCount: 0,
      missingInterfaceCount: 0,
      dependencyCycleCount: 1,
      dependencyFileCycleCount: 0,
      mixedResponsibilityFileCount: 0,
    },
  };

  assert.equal(hasBlockingSourceCodeAnalysisDiagnostics(snapshot), true);
});

test("file dependency cycles block source-code-analysis check", () => {
  const snapshot = {
    summary: {
      unclassifiedFileCount: 0,
      ambiguousFileCount: 0,
      missingInterfaceCount: 0,
      dependencyCycleCount: 0,
      dependencyFileCycleCount: 1,
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
      dependencyFileCycleCount: 0,
      mixedResponsibilityFileCount: 1,
    },
  };

  assert.equal(hasBlockingSourceCodeAnalysisDiagnostics(snapshot), true);
});

test("snapshot writer atomically creates a missing nested directory and valid file", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "source-code-analysis-"));
  const outputPath = path.join(root, "missing", "nested", "snapshot.json");
  try {
    await writeSourceCodeAnalysisSnapshot(outputPath, emptySnapshot());

    const parsed = JSON.parse(await readFile(outputPath, "utf8")) as SourceCodeAnalysisSnapshot;
    assert.equal(parsed.schemaVersion, SOURCE_CODE_ANALYSIS_SCHEMA_VERSION);
    assert.deepEqual(parsed.modules, []);
    assert.deepEqual(await readdir(path.dirname(outputPath)), ["snapshot.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("snapshot ensure replaces a schema-valid snapshot whose source digest is stale", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "source-code-analysis-ensure-"));
  const outputPath = path.join(root, "snapshot.json");
  try {
    await writeSourceCodeAnalysisSnapshot(outputPath, emptySnapshot());

    assert.equal(await runSourceCodeAnalysis(["--ensure", `--output=${outputPath}`]), 0);

    const parsed = JSON.parse(await readFile(outputPath, "utf8")) as SourceCodeAnalysisSnapshot;
    assert.notEqual(parsed.sourceDigest, "test");
    assert.ok(parsed.summary.fileCount > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
