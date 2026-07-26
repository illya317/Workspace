import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  classifyChangedPaths,
  parseNameStatusZero,
  readRepositoryChanges,
  validateTrustedImpactMap,
} from "./classify-risk.mjs";

const classifierPath = path.join(import.meta.dirname, "classify-risk.mjs");

function impactMap() {
  return validateTrustedImpactMap({
    schemaVersion: 1,
    policies: { unmatchedModulePath: "C3", unmappedWritePath: "C3" },
    suites: [{
      id: "settings-save",
      tier: "critical",
      kind: "playwright",
      selection: { grep: "@settings-save" },
      specs: ["e2e/settings-save.spec.ts"],
      covers: ["browser persistence"],
    }],
    modules: [{
      id: "settings",
      roots: { prefixes: ["packages/settings/"], files: [] },
      potentialWritePrefixes: ["packages/settings/server/"],
    }],
    rules: [{
      id: "settings-save",
      modules: ["settings"],
      paths: {
        prefixes: ["packages/settings/ui/account/", "packages/settings/server/account/"],
        files: [],
      },
      traits: ["ui", "server", "write"],
      riskFloor: "C2",
      requiredSuites: ["settings-save"],
    }],
  });
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("repository classification loads the impact map from the trusted base revision", () => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "classify-risk-git-"));
  try {
    git(repository, ["init", "-q"]);
    git(repository, ["config", "user.email", "ci@example.test"]);
    git(repository, ["config", "user.name", "CI"]);

    const mapPath = path.join(repository, "scripts/testing/module-impact-map.json");
    const sourcePath = path.join(repository, "packages/settings/ui/account/AccountPanel.tsx");
    fs.mkdirSync(path.dirname(mapPath), { recursive: true });
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(mapPath, `${JSON.stringify(impactMap(), null, 2)}\n`);
    fs.writeFileSync(sourcePath, "export const accountPanel = 'base';\n");
    git(repository, ["add", "."]);
    git(repository, ["commit", "-qm", "trusted base"]);
    const baseSha = git(repository, ["rev-parse", "HEAD"]);

    fs.writeFileSync(sourcePath, "export const accountPanel = 'candidate';\n");
    git(repository, ["add", sourcePath]);
    git(repository, ["commit", "-qm", "candidate change"]);
    const headSha = git(repository, ["rev-parse", "HEAD"]);

    // A working-tree lookup would now fail. The classifier must read the map
    // from baseSha with `git show`, because only that revision is trusted.
    fs.writeFileSync(mapPath, "{ this is deliberately invalid json\n");
    const execution = spawnSync(process.execPath, [
      classifierPath,
      "--cwd", repository,
      "--base", baseSha,
      "--head", headSha,
      "--diff-mode", "three-dot",
      "--event", "push",
    ], {
      encoding: "utf8",
    });
    assert.equal(execution.status, 0, execution.stderr);
    const result = JSON.parse(execution.stdout);

    assert.equal(result.riskClass, "C2", result.failureReason);
    assert.deepEqual(result.changedFiles, ["packages/settings/ui/account/AccountPanel.tsx"]);
    assert.deepEqual(result.matchedRuleIds, ["settings-save"]);
    assert.deepEqual(result.requiredSuites, ["settings-save"]);
    assert.deepEqual(result.e2eSpecs, ["e2e/settings-save.spec.ts"]);
  } finally {
    fs.rmSync(repository, { recursive: true, force: true });
  }
});

test("C0 accepts only explicit documentation paths", () => {
  const result = classifyChangedPaths({
    changedPaths: ["docs/engineering/checks.md", "README.md", "packages/core/README.md"],
    map: impactMap(),
  });
  assert.equal(result.riskClass, "C0");
  assert.equal(result.runStatic, true);
  assert.equal(result.runBuild, false);
  assert.equal(result.publishArtifact, false);
});

test("generated documentation is not eligible for the dependency-free C0 lane", () => {
  const result = classifyChangedPaths({
    changedPaths: ["docs/generated/action-contracts.md"],
    map: impactMap(),
  });
  assert.equal(result.riskClass, "C3");
  assert.equal(result.runStatic, true);
});

test("C1 is an allowlist for static presentation assets", () => {
  const result = classifyChangedPaths({
    changedPaths: ["packages/hr/ui/employee/styles.css"],
    map: impactMap(),
    publishRequested: true,
    finalCandidate: true,
  });
  assert.equal(result.riskClass, "C1");
  assert.equal(result.runStatic, false);
  assert.equal(result.runNode, false);
  assert.equal(result.runType, false);
  assert.equal(result.typeMode, "none");
  assert.equal(result.runBuild, true);
  assert.equal(result.runE2e, false);
  assert.equal(result.publishArtifact, true);
});

test("C1 does not include Core, Platform, app-global, or public assets", () => {
  for (const changedPath of [
    "packages/core/ui/styles.css",
    "packages/platform/ui/styles.css",
    "app/globals.css",
    "public/logo.svg",
  ]) {
    assert.equal(classifyChangedPaths({ changedPaths: [changedPath], map: impactMap() }).riskClass, "C3");
  }
});

test("documentation mixed with presentation assets fails closed instead of bypassing docs checks", () => {
  const result = classifyChangedPaths({
    changedPaths: ["app/(modules)/hr/ARCHITECTURE.md", "packages/hr/ui/employee/styles.css"],
    map: impactMap(),
  });
  assert.equal(result.riskClass, "C3");
  assert.deepEqual(result.reasonCodes, ["mixed-documentation-presentation-fail-closed"]);
  assert.equal(result.runStatic, true);
  assert.equal(result.runNode, true);
  assert.equal(result.runType, true);
});

test("mapped C1 code and final candidates keep affected typecheck", () => {
  const map = structuredClone(impactMap());
  map.rules[0].riskFloor = "C1";
  map.rules[0].traits = ["ui"];
  const mapped = classifyChangedPaths({
    changedPaths: ["packages/settings/ui/account/Label.tsx"],
    map,
  });
  assert.equal(mapped.riskClass, "C1");
  assert.equal(mapped.runNode, true);
  assert.equal(mapped.runType, true);
  assert.equal(mapped.typeMode, "affected");
  assert.equal(mapped.runBuild, false);

  const finalMapped = classifyChangedPaths({
    changedPaths: ["packages/settings/ui/account/Label.tsx"],
    map,
    finalCandidate: true,
  });
  assert.equal(finalMapped.typeMode, "affected");
  assert.equal(finalMapped.runBuild, false);

  const ready = classifyChangedPaths({
    changedPaths: ["packages/hr/ui/styles.css"],
    map,
    finalCandidate: true,
  });
  assert.equal(ready.runStatic, false);
  assert.equal(ready.runNode, false);
  assert.equal(ready.runType, false);
  assert.equal(ready.runBuild, false);
});

test("covered module code selects C2 and its exact E2E spec", () => {
  const result = classifyChangedPaths({
    changedPaths: ["packages/settings/ui/account/AccountPanel.tsx"],
    map: impactMap(),
  });
  assert.equal(result.riskClass, "C2");
  assert.equal(result.runPostgresql, true);
  assert.equal(result.runE2e, true);
  assert.equal(result.e2eMode, "targeted");
  assert.deepEqual(result.e2eSpecs, ["e2e/settings-save.spec.ts"]);
});

test("known module code without a coverage rule fails closed to C3", () => {
  const result = classifyChangedPaths({
    changedPaths: ["packages/settings/ui/UnknownPanel.tsx"],
    map: impactMap(),
  });
  assert.equal(result.riskClass, "C3");
  assert.equal(result.runPostgresql, true);
  assert.equal(result.e2eMode, "full");
  assert.deepEqual(result.unmappedModulePaths, ["packages/settings/ui/UnknownPanel.tsx"]);
});

test("unknown infrastructure paths fail closed to C3", () => {
  const result = classifyChangedPaths({
    changedPaths: [".github/workflows/ci.yml"],
    map: impactMap(),
  });
  assert.equal(result.riskClass, "C3");
  assert.equal(result.publishArtifact, false);
});

test("large source or line diffs escalate to C3", () => {
  const sourcePaths = Array.from({ length: 21 }, (_, index) => `packages/settings/ui/account/File${index}.tsx`);
  const manyFiles = classifyChangedPaths({ changedPaths: sourcePaths, map: impactMap() });
  assert.equal(manyFiles.riskClass, "C3");
  assert.ok(manyFiles.escalationReasons.includes("source-file-count-over-20"));

  const manyLines = classifyChangedPaths({
    changedPaths: ["docs/engineering/checks.md"],
    changes: [{ status: "M", paths: ["docs/engineering/checks.md"] }],
    lineStats: [{ path: "docs/engineering/checks.md", additions: 501, deletions: 0 }],
    map: impactMap(),
  });
  assert.equal(manyLines.riskClass, "C3");
  assert.ok(manyLines.escalationReasons.includes("changed-lines-over-500"));
});

test("non-presentation binary changes always escalate to C3", () => {
  const result = classifyChangedPaths({
    changedPaths: ["packages/settings/ui/account/model.wasm"],
    changes: [{ status: "A", paths: ["packages/settings/ui/account/model.wasm"] }],
    lineStats: [{
      path: "packages/settings/ui/account/model.wasm",
      additions: 0,
      deletions: 0,
      binary: true,
      sizeBytes: 1,
    }],
    map: impactMap(),
  });
  assert.equal(result.riskClass, "C3");
  assert.ok(result.escalationReasons.includes("non-presentation-binary-change"));
});

test("two business modules escalate even when both are presentation-only", () => {
  const result = classifyChangedPaths({
    changedPaths: ["packages/hr/ui/a.css", "packages/finance/ui/b.css"],
    map: impactMap(),
  });
  assert.equal(result.riskClass, "C3");
  assert.ok(result.escalationReasons.includes("multiple-business-modules"));
});

test("large or mass presentation assets escalate to full CI", () => {
  const large = classifyChangedPaths({
    changedPaths: ["packages/hr/ui/hero.png"],
    changes: [{ status: "A", paths: ["packages/hr/ui/hero.png"] }],
    lineStats: [{ path: "packages/hr/ui/hero.png", additions: 0, deletions: 0, binary: true, sizeBytes: 2 * 1024 * 1024 + 1 }],
    map: impactMap(),
  });
  assert.equal(large.riskClass, "C3");
  assert.ok(large.escalationReasons.includes("presentation-file-over-2mb"));

  const largeText = classifyChangedPaths({
    changedPaths: ["packages/hr/ui/hero.svg"],
    changes: [{ status: "A", paths: ["packages/hr/ui/hero.svg"] }],
    lineStats: [{
      path: "packages/hr/ui/hero.svg",
      additions: 1,
      deletions: 0,
      binary: false,
      sizeBytes: 2 * 1024 * 1024 + 1,
    }],
    map: impactMap(),
  });
  assert.equal(largeText.riskClass, "C3");
  assert.ok(largeText.escalationReasons.includes("presentation-file-over-2mb"));

  const manyPaths = Array.from({ length: 21 }, (_, index) => `packages/hr/ui/assets/icon-${index}.svg`);
  const many = classifyChangedPaths({ changedPaths: manyPaths, map: impactMap() });
  assert.equal(many.riskClass, "C3");
  assert.ok(many.escalationReasons.includes("presentation-file-count-over-20"));
});

test("repository size accounting includes single-line text presentation assets", () => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "classify-risk-presentation-size-"));
  try {
    git(repository, ["init", "-q"]);
    git(repository, ["config", "user.email", "ci@example.test"]);
    git(repository, ["config", "user.name", "CI"]);
    const asset = path.join(repository, "packages/hr/ui/hero.svg");
    fs.mkdirSync(path.dirname(asset), { recursive: true });
    fs.writeFileSync(asset, "<svg/>");
    git(repository, ["add", "."]);
    git(repository, ["commit", "-qm", "base"]);
    const baseSha = git(repository, ["rev-parse", "HEAD"]);
    fs.writeFileSync(asset, "<svg>" + "x".repeat(2 * 1024 * 1024) + "</svg>");
    git(repository, ["add", "."]);
    git(repository, ["commit", "-qm", "large text asset"]);
    const headSha = git(repository, ["rev-parse", "HEAD"]);
    const { lineStats } = readRepositoryChanges({
      cwd: repository,
      baseSha,
      headSha,
      diffMode: "three-dot",
    });
    assert.equal(lineStats.length, 1);
    assert.equal(lineStats[0].binary, false);
    assert.ok(lineStats[0].sizeBytes > 2 * 1024 * 1024);
  } finally {
    fs.rmSync(repository, { recursive: true, force: true });
  }
});

test("test deletion, runner edits, and public-contract shape changes explicitly escalate", () => {
  const cases = [
    {
      path: "packages/settings/ui/account/Label.test.tsx",
      change: { status: "D", paths: ["packages/settings/ui/account/Label.test.tsx"] },
      reason: "test-deletion",
    },
    {
      path: "packages/settings/ui/account/Label.fixture.tsx",
      changedPaths: [
        "packages/settings/ui/account/Label.test.tsx",
        "packages/settings/ui/account/Label.fixture.tsx",
      ],
      change: {
        status: "R100",
        paths: [
          "packages/settings/ui/account/Label.test.tsx",
          "packages/settings/ui/account/Label.fixture.tsx",
        ],
      },
      reason: "test-deletion",
    },
    {
      path: "scripts/ci/classify-risk.mjs",
      change: { status: "M", paths: ["scripts/ci/classify-risk.mjs"] },
      reason: "runner-or-ci-change",
    },
    {
      path: "app/api/modules/settings/route.ts",
      change: { status: "A", paths: ["app/api/modules/settings/route.ts"] },
      reason: "public-contract-shape-change",
    },
  ];
  for (const item of cases) {
    const result = classifyChangedPaths({
      changedPaths: item.changedPaths ?? [item.path],
      changes: [item.change],
      map: impactMap(),
    });
    assert.equal(result.riskClass, "C3");
    assert.ok(result.escalationReasons.includes(item.reason));
  }
});

test("forced classification always selects the full matrix", () => {
  const result = classifyChangedPaths({
    changedPaths: ["docs/README.md"],
    map: null,
    forceFull: true,
    publishRequested: true,
  });
  assert.equal(result.riskClass, "C3");
  assert.equal(result.runNode, true);
  assert.equal(result.runType, true);
  assert.equal(result.runPostgresql, true);
  assert.equal(result.runBuild, true);
  assert.equal(result.runE2e, true);
  assert.equal(result.publishArtifact, true);
});

test("NUL name-status parser keeps both sides of renames", () => {
  const changes = parseNameStatusZero(Buffer.from("M\0docs/a.md\0R100\0old.ts\0new.ts\0"));
  assert.deepEqual(changes, [
    { status: "M", paths: ["docs/a.md"] },
    { status: "R100", paths: ["old.ts", "new.ts"] },
  ]);
});

test("impact map refuses policies that do not fail closed", () => {
  const invalid = structuredClone(impactMap());
  invalid.policies.unmatchedModulePath = "C2";
  assert.throws(() => validateTrustedImpactMap(invalid), /fail closed to C3/);
});

test("impact map refuses a C1 write rule", () => {
  const invalid = structuredClone(impactMap());
  invalid.rules[0].riskFloor = "C1";
  assert.throws(() => validateTrustedImpactMap(invalid), /riskFloor must be C2 or C3/);
});
