import assert from "node:assert/strict";
import test from "node:test";

import {
  capabilityGovernedModuleForPath,
  parseCapabilityOwnershipBaseline,
  sourceCapabilityDeclarationsForPath,
  type SourceCapabilityDeclaration,
} from "./capabilities";

test("four governed packages assign semantic directory and root files to L2 capabilities", () => {
  const examples = [
    ["platform", "packages/platform/server/approvals/store.ts", "workflow-approvals"],
    ["platform", "packages/platform/source-code-analysis-contract.ts", "platform-foundation"],
    ["finance", "packages/finance/server/assets/service.ts", "assets"],
    ["finance", "packages/finance/index.ts", "shared-contracts"],
    ["work", "packages/work/server/meetings/application.ts", "meetings"],
    ["work", "packages/work/index.ts", "shared-contracts"],
    ["hr", "packages/hr/server/analysis/route.ts", "analysis"],
    ["hr", "packages/hr/server/performance/contribution-detail.ts", "performance"],
    ["hr", "packages/hr/index.ts", "shared-contracts"],
  ] as const;

  for (const [moduleKey, relativePath, capabilityKey] of examples) {
    assert.deepEqual(
      sourceCapabilityDeclarationsForPath(moduleKey, relativePath).map((candidate) => candidate.key),
      [capabilityKey],
    );
  }
});

test("unknown package paths and non-governed modules do not inherit a catch-all capability", () => {
  assert.equal(capabilityGovernedModuleForPath("packages/work/new-capability/file.ts"), "work");
  assert.deepEqual(sourceCapabilityDeclarationsForPath("work", "packages/work/new-capability/file.ts"), []);
  assert.deepEqual(sourceCapabilityDeclarationsForPath("docs", "packages/docs/server/index.ts"), []);
  assert.equal(capabilityGovernedModuleForPath("app/api/modules/work/route.ts"), null);
});

test("matching collects every candidate so overlapping declarations remain ambiguous", () => {
  const declarations: SourceCapabilityDeclaration[] = [
    {
      moduleKey: "work",
      key: "projects",
      label: "项目",
      include: [{ kind: "prefix", path: "packages/work/server/" }],
    },
    {
      moduleKey: "work",
      key: "meetings",
      label: "会议",
      include: [{ kind: "file", path: "packages/work/server/meetings.ts" }],
    },
  ];

  assert.deepEqual(
    sourceCapabilityDeclarationsForPath("work", "packages/work/server/meetings.ts", declarations)
      .map((candidate) => candidate.key),
    ["projects", "meetings"],
  );
});

test("baseline parser rejects misspelled modules, extra top-level structure, and duplicates", () => {
  assert.throws(() => parseCapabilityOwnershipBaseline({
    schemaVersion: 1,
    legacyUnclassifiedFiles: { works: [] },
  }), /unknown modules: works/);
  assert.throws(() => parseCapabilityOwnershipBaseline({
    schemaVersion: 1,
    legacyUnclassifiedFiles: {},
    ignored: true,
  }), /unknown top-level keys/);
  assert.throws(() => parseCapabilityOwnershipBaseline({
    schemaVersion: 1,
    legacyUnclassifiedFiles: {
      work: ["packages/work/legacy.ts", "packages/work/legacy.ts"],
    },
  }), /duplicate capability baseline path/);
});
