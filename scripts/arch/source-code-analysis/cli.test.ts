import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  isSourceCodeAnalysisSnapshot,
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
      reciprocalRoleDependencyCount: 0,
      runtimeReciprocalRoleDependencyCount: 0,
      typeAssistedReciprocalRoleDependencyCount: 0,
      dependencyFileCycleCount: 0,
      runtimeDependencyFileCycleCount: 0,
      typeAssistedDependencyFileCycleCount: 0,
      invalidDependencyDirectionCount: 0,
      mixedResponsibilityFileCount: 0,
      capabilityGovernedFileCount: 0,
      capabilityDeclaredFileCount: 0,
      capabilityCoveragePercent: 100,
      legacyUnclassifiedCapabilityFileCount: 0,
      newUnclassifiedCapabilityFileCount: 0,
      ambiguousCapabilityFileCount: 0,
    },
    modules: [],
    capabilities: [],
    dependencyEdges: [],
    capabilityDependencyEdges: [],
    reciprocalRoleDependencies: [],
    dependencyFileCycles: [],
    invalidDependencyDirections: [],
    dependencyCycles: [],
    diagnostics: {
      unclassifiedFiles: [],
      ambiguousFiles: [],
      missingInterfaces: [],
      mixedResponsibilityFiles: [],
      legacyUnclassifiedCapabilityFiles: [],
      newUnclassifiedCapabilityFiles: [],
      ambiguousCapabilityFiles: [],
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
      invalidDependencyDirectionCount: 0,
      mixedResponsibilityFileCount: 0,
      newUnclassifiedCapabilityFileCount: 0,
      ambiguousCapabilityFileCount: 0,
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
      invalidDependencyDirectionCount: 0,
      mixedResponsibilityFileCount: 0,
      newUnclassifiedCapabilityFileCount: 0,
      ambiguousCapabilityFileCount: 0,
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
      invalidDependencyDirectionCount: 0,
      mixedResponsibilityFileCount: 1,
      newUnclassifiedCapabilityFileCount: 0,
      ambiguousCapabilityFileCount: 0,
    },
  };

  assert.equal(hasBlockingSourceCodeAnalysisDiagnostics(snapshot), true);
});

test("invalid dependency directions block source-code-analysis check", () => {
  const snapshot = {
    summary: {
      unclassifiedFileCount: 0,
      ambiguousFileCount: 0,
      missingInterfaceCount: 0,
      dependencyCycleCount: 0,
      dependencyFileCycleCount: 0,
      invalidDependencyDirectionCount: 1,
      mixedResponsibilityFileCount: 0,
      newUnclassifiedCapabilityFileCount: 0,
      ambiguousCapabilityFileCount: 0,
    },
  };

  assert.equal(hasBlockingSourceCodeAnalysisDiagnostics(snapshot), true);
});

test("new or ambiguous L2 capability ownership blocks while legacy debt does not", () => {
  const summary = {
    unclassifiedFileCount: 0,
    ambiguousFileCount: 0,
    missingInterfaceCount: 0,
    dependencyCycleCount: 0,
    dependencyFileCycleCount: 0,
    invalidDependencyDirectionCount: 0,
    mixedResponsibilityFileCount: 0,
    newUnclassifiedCapabilityFileCount: 0,
    ambiguousCapabilityFileCount: 0,
  };

  assert.equal(hasBlockingSourceCodeAnalysisDiagnostics({ summary }), false);
  assert.equal(hasBlockingSourceCodeAnalysisDiagnostics({
    summary: { ...summary, newUnclassifiedCapabilityFileCount: 1 },
  }), true);
  assert.equal(hasBlockingSourceCodeAnalysisDiagnostics({
    summary: { ...summary, ambiguousCapabilityFileCount: 1 },
  }), true);
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

test("snapshot contract rejects malformed L2 capability keys and missing edge arrays", () => {
  const malformedKey = emptySnapshot();
  malformedKey.capabilities = [{
    moduleKey: "work",
    key: "Meetings/Unsafe",
    label: "会议",
    fileCount: 0,
    lines: 0,
    roles: Object.fromEntries([]) as SourceCodeAnalysisSnapshot["capabilities"][number]["roles"],
    dependencies: [],
    dependencyCount: 0,
    crossCapabilityImportCount: 0,
    mixedResponsibilityFileCount: 0,
  }];
  assert.equal(isSourceCodeAnalysisSnapshot(malformedKey), false);

  const missingEdges = { ...emptySnapshot(), capabilityDependencyEdges: undefined };
  assert.equal(isSourceCodeAnalysisSnapshot(missingEdges), false);

  const nullDirection = emptySnapshot();
  nullDirection.invalidDependencyDirections = [null] as unknown as SourceCodeAnalysisSnapshot["invalidDependencyDirections"];
  assert.equal(isSourceCodeAnalysisSnapshot(nullDirection), false);

  const nullCycle = emptySnapshot();
  nullCycle.dependencyFileCycles = [null] as unknown as SourceCodeAnalysisSnapshot["dependencyFileCycles"];
  assert.equal(isSourceCodeAnalysisSnapshot(nullCycle), false);

  const nullCycleCell = emptySnapshot();
  nullCycleCell.dependencyFileCycles = [{
    classification: "runtime",
    paths: ["packages/work/a.ts"],
    cells: [null] as unknown as SourceCodeAnalysisSnapshot["dependencyFileCycles"][number]["cells"],
    evidence: [],
  }];
  assert.equal(isSourceCodeAnalysisSnapshot(nullCycleCell), false);
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
