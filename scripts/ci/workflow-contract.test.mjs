import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const promotionWorkflow = fs.readFileSync(
  new URL("../../.github/workflows/promote-candidate.yml", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const prePush = fs.readFileSync(new URL("../../.githooks/pre-push", import.meta.url), "utf8");
const codeowners = fs.readFileSync(new URL("../../.github/CODEOWNERS", import.meta.url), "utf8");
const packager = fs.readFileSync(new URL("../../ops/build-standalone-artifact.sh", import.meta.url), "utf8");
const pinnedActions = {
  "actions/checkout": "34e114876b0b11c390a56381ad16ebd13914f8d5",
  "actions/setup-node": "49933ea5288caeca8642d1e84afbd3f7d6820020",
  "actions/cache": "0057852bfaa89a56745cba8c7296529d2fc39830",
  "actions/upload-artifact": "ea165f8d65b6e75b540449e92b4886f43607fa02",
  "actions/download-artifact": "d3f86a106a0bac45b974a628896c90dbdf5c8093",
};

test("workflow reruns on PR lifecycle changes and supports only the upgrade label", () => {
  assert.match(workflow, /ready_for_review, converted_to_draft, labeled, unlabeled/);
  assert.match(workflow, /\*'"ci-full"'\*\) force_full=true/);
  assert.doesNotMatch(workflow, /ci-skip|risk-downgrade/);
  assert.equal([...workflow.matchAll(/args\+=\(--force-full\)/g)].length, 1);
  assert.match(workflow, /group: ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.event_name \}\}-/);
});

test("continuous owner pushes reuse one bot candidate and cancel stale CI", () => {
  assert.match(promotionWorkflow, /group: promote-candidate-main\n\s+cancel-in-progress: true/);
  assert.match(promotionWorkflow, /expected_staging_branch="codex\/staging-main"/);
  assert.match(promotionWorkflow, /candidate_branch="codex\/candidate-main"/);
  assert.match(promotionWorkflow, /--force-with-lease="refs\/heads\/\$candidate_branch:\$candidate_before"/);
  assert.doesNotMatch(promotionWorkflow, /push origin --delete "\$STAGING_BRANCH"/);
  assert.match(workflow, /cancel-in-progress: true/);
});

test("workflow exposes forced exact-SHA dispatch and stable required evidence", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /target_sha:/);
  assert.match(workflow, /force_full:/);
  assert.match(workflow, /publish_artifact:/);
  assert.match(workflow, /name: CI \/ required/);
  assert.match(workflow, /name: workspace-standalone-\$\{\{ needs\.classify\.outputs\.source_sha \}\}-run-\$\{\{ github\.run_id \}\}-attempt-\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /ci-artifact-\$\{SOURCE_SHA\}-run-\$\{GITHUB_RUN_ID\}-attempt-\$\{GITHUB_RUN_ATTEMPT\}/);
  assert.match(workflow, /CI_CLASSIFICATION_JSON:/);
  assert.match(workflow, /CI_REQUIRED_SUITES_JSON:/);
  assert.match(workflow, /CI_E2E_SPECS_JSON:/);
  assert.match(workflow, /name: Keep recent artifacts and every active deployment\n\s+continue-on-error: true/);
});

test("adaptive diff and hidden canonical artifacts remain usable on GitHub runners", () => {
  assert.match(
    workflow,
    new RegExp(
      "static:\\n[\\s\\S]*?actions/checkout@" + pinnedActions["actions/checkout"]
        + " # v4\\n\\s+with:\\n\\s+fetch-depth: 0",
    ),
  );
  assert.match(workflow, /name: Upload canonical standalone artifact[\s\S]*?include-hidden-files: true/);
  assert.match(workflow, /name: Retain structured release evidence[\s\S]*?include-hidden-files: true/);
  assert.match(workflow, /name: Enforce canonical npm install input\n\s+run: test ! -e npm-shrinkwrap\.json/);
});

test("every third-party workflow action is pinned to an audited full commit SHA", () => {
  for (const [action, sha] of Object.entries(pinnedActions)) {
    assert.match(workflow, new RegExp(action.replace("/", "\\/") + "@" + sha + "\\b"));
  }
  const uses = [...workflow.matchAll(/^\s*uses:\s*(\S+)/gm)].map((match) => match[1]);
  assert.ok(uses.length > 0);
  for (const reference of uses) {
    assert.match(reference, /^[^@]+@[0-9a-f]{40}$/, "movable action reference: " + reference);
  }
});

test("public runtime asset symlinks cannot leak into the public canonical artifact", () => {
  assert.match(packager, /public\/company/);
  assert.match(packager, /public\/assets\/agent\/avatar/);
  assert.match(packager, /public\/assets\/user\/avatar/);
  assert.match(packager, /find "\$standalone_app_dir\/public" -type l -print/);
  assert.match(packager, /standalone public 目录包含未登记软链/);
});

test("quality executors and every workflow are code-owner protected", () => {
  for (const pattern of [
    "/.github/",
    "/.githooks/",
    "/package.json",
    "/package-lock.json",
    "/npm-shrinkwrap.json",
    "/*.config.*",
    "/.nvmrc",
    "/.node-version",
    "/.tool-versions",
    "/packages/*/package.json",
    "/scripts/",
    "**/*.test.*",
    "**/*.spec.*",
    "/.npmrc",
    "/dependency-cruiser.config.cjs",
    "/eslint.config.mjs",
    "/next.config.ts",
    "/postcss.config.mjs",
    "/prisma.config.ts",
    "/tsconfig.json",
    "/tsconfig*.json",
    "/tsconfig.hr-check.json",
    "/tsconfig.modal.json",
    "/tsconfig.platform-check.json",
    "/tsconfig.project-tab-check.json",
    "/tsconfig.work-ui-check.json",
    "/scripts/ci/",
    "/scripts/check/",
    "/scripts/arch/",
    "/scripts/testing/",
    "/playwright.config.ts",
    "/e2e/",
    "/ops/",
    "/docs/engineering/ops/",
    "/docs/engineering/checks.md",
    "/docs/engineering/agent-handbook.md",
    "/docs/roles/operations.md",
    "/prisma/",
    "/scripts/migrate/",
    "/scripts/runtime/",
    "/scripts/seed-resources-runtime.mjs",
    "/scripts/provision-agent-workforce.mjs",
    "/scripts/lib/agent-workforce-specs.mjs",
    "/scripts/write-resource-manifest.ts",
  ]) {
    assert.ok(codeowners.split("\n").includes(`${pattern} @illya317`), `missing CODEOWNERS rule for ${pattern}`);
  }
});

test("local push and E2E tier scripts remain wired", () => {
  assert.equal(packageJson.scripts["check:push"], "node scripts/ci/run-local-push.mjs");
  assert.match(packageJson.scripts["test:e2e:critical"], /--grep @critical/);
  assert.match(packageJson.scripts["test:e2e:nightly"], /--grep @nightly/);
  assert.match(packageJson.scripts["test:e2e:latency"], /--grep @latency/);
  assert.match(prePush, /npm run check:push/);
  assert.match(prePush, /ci_tree:\$ci_base:/);
});
