import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const workflow = read("../../.github/workflows/ci.yml");
const cnb = read("../../.cnb.yml");
const cnbDeploy = read("../../.cnb/tag_deploy.yml");
const imageDockerfile = read("../../ops/image.Dockerfile");
const deployImage = read("../../ops/deploy-image.sh");
const cnbImageRelease = read("../../ops/cnb-image-release.sh");
const packageJson = JSON.parse(read("../../package.json"));
const preCommit = read("../../.githooks/pre-commit");
const prePush = read("../../.githooks/pre-push");
const codeowners = read("../../.github/CODEOWNERS");
const packager = read("../../ops/build-standalone-artifact.sh");

test("GitHub is the only CI and application-image builder", () => {
  for (const job of ["changed", "node", "type", "postgresql", "build", "e2e", "required", "image", "cnb"]) {
    assert.match(workflow, new RegExp(`^  ${job}:`, "m"));
  }
  assert.match(workflow, /name: CI \/ required/);
  assert.match(workflow, /needs: \[changed, node, type, postgresql, build, e2e\]/);
  assert.match(workflow, /name: CI \/ build once/);
  assert.match(workflow, /STANDALONE_SKIP_NEXT_BUILD=1/);
  assert.match(workflow, /name: Image \/ publish exact digest/);
  assert.match(workflow, /platforms: linux\/amd64/);
  assert.match(workflow, /packages: write/);
  assert.match(workflow, /ghcr\.io/);
});

test("changed checks stay static while PostgreSQL owns the database migration diff", () => {
  const changed = workflow.slice(workflow.indexOf("  changed:"), workflow.indexOf("  node:"));
  const postgresql = workflow.slice(workflow.indexOf("  postgresql:"), workflow.indexOf("  build:"));
  assert.match(changed, /PRISMA_MIGRATION_CHECK_MODE: static/);
  assert.match(postgresql, /services:\n\s+postgres:/);
  assert.match(postgresql, /npm run check:data/);
});

test("E2E consumes the canonical archive without a second Next build", () => {
  const e2e = workflow.slice(workflow.indexOf("  e2e:"), workflow.indexOf("  required:"));
  assert.match(e2e, /actions\/download-artifact@/);
  assert.match(e2e, /path: \.next/);
  assert.match(e2e, /PLAYWRIGHT_STANDALONE_ARCHIVE: \.next\/workspace-standalone\.tgz/);
  assert.match(e2e, /PLAYWRIGHT_STANDALONE_MANIFEST: \.next\/workspace-standalone\.manifest\.json/);
  assert.match(e2e, /npm run test:e2e:smoke/);
  assert.doesNotMatch(e2e, /npm run build/);
});

test("the portable runtime artifact is uploaded once in canonical archive form", () => {
  const build = workflow.slice(workflow.indexOf("  build:"), workflow.indexOf("  e2e:"));
  const image = workflow.slice(workflow.indexOf("  image:"), workflow.indexOf("  cnb:"));
  assert.match(build, /\.next\/workspace-standalone\.tgz/);
  assert.match(build, /\.next\/workspace-standalone\.manifest\.json/);
  assert.doesNotMatch(build, /\.next\/standalone\n|\.next\/static\n|\.next\/BUILD_ID/);
  assert.match(image, /tar -xzf \.next\/workspace-standalone\.tgz/);
});

test("only protected main publishes and dispatches an exact CNB release", () => {
  const image = workflow.slice(workflow.indexOf("  image:"), workflow.indexOf("  cnb:"));
  const cnbJob = workflow.slice(workflow.indexOf("  cnb:"));
  assert.match(image, /github\.event_name == 'push'/);
  assert.match(image, /github\.ref == 'refs\/heads\/main'/);
  assert.match(cnbJob, /CNB_TRIGGER_TOKEN/);
  assert.match(cnbJob, /api_trigger_rehearsal\|api_trigger_deploy/);
  for (const input of ["SOURCE_SHA", "SOURCE_TREE", "IMAGE_REF", "IMAGE_DIGEST", "RELEASE_MANIFEST_URL", "GITHUB_RUN_ID"]) {
    assert.match(cnbJob, new RegExp(input));
  }
  assert.doesNotMatch(cnbJob, /pull_request/);
  assert.doesNotMatch(workflow, /self-hosted|workspace-release-mac/);
});

test("CNB is thin CD: mirror, rehearsal, production and rollback only", () => {
  assert.match(cnb, /^main:\n  api_trigger_rehearsal:/m);
  assert.match(cnb, /^  api_trigger_deploy:/m);
  assert.match(cnb, /tag_deploy\.production:/);
  assert.match(cnb, /cnb-image-release\.sh prepare/);
  assert.match(cnb, /cnb-image-release\.sh rehearsal/);
  assert.match(cnb, /cnb-image-release\.sh production/);
  assert.match(cnb, /rollback-image\.sh/);
  assert.match(cnbDeploy, /approver:/);
  assert.doesNotMatch(`${cnb}\n${cnbImageRelease}`, /npm ci|typecheck|test:e2e|npm run build|docker build/);
  assert.match(cnbImageRelease, /pushed_digest.*IMAGE_DIGEST/s);
  assert.match(cnbImageRelease, /docker create --entrypoint \/release\.json/);
  assert.doesNotMatch(cnbImageRelease, /CNB_COMMIT.*SOURCE_SHA/);
  assert.match(deployImage, /PRODUCTION_IMAGE_DEPLOY_ENABLED/);
  assert.match(deployImage, /pg_dump/);
  assert.match(deployImage, /flock -n/);
  assert.match(deployImage, /online image digest mismatch/);
});

test("runtime image packages the prebuilt standalone output and never compiles", () => {
  assert.match(imageDockerfile, /COPY runtime\/ \.\//);
  assert.match(imageDockerfile, /COPY release\/ \/release\//);
  assert.doesNotMatch(imageDockerfile, /npm (ci|install|run)|next build|pnpm|yarn/);
  assert.doesNotMatch(imageDockerfile, /latest/);
});

test("workflow pins third-party actions and uses the repository Node contract", () => {
  const uses = [...workflow.matchAll(/^\s*uses:\s*(\S+)/gm)].map((match) => match[1]);
  assert.ok(uses.length > 0);
  for (const reference of uses) assert.match(reference, /^[^@]+@[0-9a-f]{40}$/);
  assert.match(workflow, /node-version-file: \.node-version/);
  assert.doesNotMatch(workflow, /node-version:\s*\d+/);
});

test("agent-selected checks and staged checks remain explicit interfaces", () => {
  assert.equal(packageJson.scripts["check:agent"], "node scripts/check/run-agent-check-plan.mjs");
  assert.equal(packageJson.scripts["check:push"], "npm run check:changed");
  assert.equal(packageJson.scripts["check:precommit"], "node scripts/check/run-staged-precommit.mjs");
  assert.match(preCommit, /exact staged-tree pre-commit checks/);
  assert.doesNotMatch(prePush, /PRE_PUSH_FULL|check:push:full/);
});

test("public runtime asset symlinks cannot leak into the canonical artifact", () => {
  assert.match(packager, /public\/company/);
  assert.match(packager, /public\/assets\/agent\/avatar/);
  assert.match(packager, /public\/assets\/user\/avatar/);
  assert.match(packager, /standalone public 目录包含未登记软链/);
});

test("quality executors and operations remain code-owner protected", () => {
  for (const pattern of ["/.github/", "/package.json", "/scripts/ci/", "/scripts/check/", "/scripts/arch/", "/scripts/testing/", "/ops/", "/docs/engineering/ops/"]) {
    assert.ok(codeowners.split("\n").includes(`${pattern} @illya317`), `missing CODEOWNERS rule for ${pattern}`);
  }
});
