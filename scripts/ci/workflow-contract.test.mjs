import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const cnb = read("../../.cnb.yml");
const cnbDeploy = read("../../.cnb/tag_deploy.yml");
const cnbCi = read("../../ops/cnb-ci.sh");
const cnbCiCache = read("../../ops/cnb-ci-cache.Dockerfile");
const cnbRelease = read("../../ops/cnb-release.sh");
const imageDockerfile = read("../../ops/image.Dockerfile");
const deployImage = read("../../ops/deploy-image.sh");
const packageJson = JSON.parse(read("../../package.json"));
const packager = read("../../ops/build-standalone-artifact.sh");
const nodeVersion = read("../../.node-version").trim();

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function checkoutFixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cnb-clean-checkout-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.mkdirSync(path.join(cwd, "ops"));
  fs.copyFileSync(new URL("../../ops/cnb-ci.sh", import.meta.url), path.join(cwd, "ops/cnb-ci.sh"));
  fs.writeFileSync(path.join(cwd, "tracked.txt"), "source\n");
  git(cwd, ["init", "--quiet"]);
  git(cwd, ["config", "user.email", "cnb-contract@example.test"]);
  git(cwd, ["config", "user.name", "CNB Contract"]);
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "--quiet", "-m", "source"]);
  return cwd;
}

function runCheckout(cwd, environment) {
  return spawnSync("bash", ["ops/cnb-ci.sh", "checkout"], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CNB_PULL_REQUEST_LIKE: "false",
      CNB_PULL_REQUEST_MERGE_SHA: "",
      ...environment,
    },
  });
}

test("CNB is the only source CI, image builder, registry and CD platform", () => {
  for (const removedPath of ["../../.github", "../../apps", "../../scripts/deploy"]) {
    assert.equal(fs.existsSync(new URL(removedPath, import.meta.url)), false, removedPath);
  }
  for (const removedScript of ["ci", "check:ci", "check:full", "deploy:graph:check", "deploy:unit:app"]) {
    assert.equal(packageJson.scripts[removedScript], undefined, removedScript);
  }
  assert.match(cnb, /^main:\n  pull_request:/m);
  assert.match(cnb, /^  push:/m);
  assert.doesNotMatch(`${cnb}\n${cnbCi}\n${cnbRelease}`, /github|ghcr\.io|GITHUB_|GHCR_|skopeo/i);
  assert.doesNotMatch(cnb, /NEXTAUTH_SECRET:.*\b20\d{2}\b/);
});

test("PR and main restore the versioned dependency image and aggregate native parallel jobs", () => {
  assert.equal((cnb.match(/cnb-ci\.sh checkout/g) ?? []).length, 2);
  assert.equal((cnb.match(/restore-dependencies/g) ?? []).length, 2);
  assert.equal((cnb.match(/cnb-ci\.sh setup/g) ?? []).length, 2);
  assert.equal((cnb.match(/cnb-ci\.sh lane/g) ?? []).length, 24);
  assert.equal((cnb.match(/cnb-ci\.sh summary/g) ?? []).length, 2);
  assert.equal((cnb.match(/allowFailure: true/g) ?? []).length, 24);
  assert.doesNotMatch(cnbCi, /npm ci|playwright install/);
  assert.equal((cnbCiCache.match(/npm ci --no-audit/g) ?? []).length, 1);
  assert.match(cnbCiCache, /PLAYWRIGHT_BROWSERS_PATH=\/ms-playwright/);
  assert.match(cnbCiCache, /playwright install --with-deps chromium/);
  assert.match(cnbCiCache, new RegExp(`FROM node:${nodeVersion}-bookworm@sha256:[0-9a-f]{64}`));
  assert.match(cnb, /package-lock\.json[\s\S]*ops\/cnb-ci-cache\.Dockerfile/);
  assert.equal((cnb.match(/sync: "true"/g) ?? []).length, 2);
  assert.match(cnb, /copy-on-write-read-only/);
  assert.match(cnb, /main:\/workspace\/\.next\/cache:read-write/);
  assert.match(cnb, /main:\/workspace\/\.cache\/eslint:read-write/);
  assert.match(cnb, /main:\/workspace\/\.cache\/types:read-write/);
  assert.match(cnb, /main:\/workspace\/\.cache\/tsbuild:read-write/);
  assert.match(cnb, /key: main-cnb-delivery-cache[\s\S]*wait: true/);
  assert.match(cnb, /ln -s \/opt\/workspace-deps\/node_modules node_modules/);
  assert.match(cnbCi, /run-node-tests\.mjs bucket/);
  assert.match(cnbCi, /suite="cnb-\$\{LANE\}"/);
  assert.match(cnbCi, /NODE_OPTIONS=--max-old-space-size=8192[\s\\]+CHECK_LOCK=0 node scripts\/check\/run-typecheck\.js --build/);
  assert.match(cnbCi, /git ls-files -s --[\s\S]*'\*\.prisma'[\s\S]*git hash-object --stdin/);
  assert.match(cnbCi, /CNB typecheck content cache hit/);
  assert.match(cnbCi, /cnb-typecheck-results/);
  assert.match(cnbCi, /-mtime \+30 -delete/);
  assert.match(cnbCi, /STANDALONE_SKIP_NEXT_BUILD=1/);
  assert.match(cnbCi, /npm run test:integration:postgresql/);
  assert.match(cnbCi, /npm run db:generate:inner/);
  assert.match(cnbCi, /PLAYWRIGHT_STANDALONE_ARCHIVE=/);
  assert.match(cnbCi, /for lane in setup static-policy static-domain static-ui static-lint node-0 node-1 node-2 node-3 typecheck build database e2e/);
  assert.match(cnbCi, /npm run test:e2e:smoke/);
  assert.match(cnbCi, /CNB required failed lanes/);
  assert.match(cnbCi, /CNB_PULL_REQUEST_MERGE_SHA/);
  assert.match(cnbCi, /git status --porcelain=v1 --untracked-files=all/);
  assert.match(cnbCi, /CNB 必须从干净 checkout 开始/);
});

test("CNB accepts only a clean event checkout and handles PR pre-merge identity", (t) => {
  const cwd = checkoutFixture(t);
  const sourceSha = git(cwd, ["rev-parse", "HEAD"]);
  assert.equal(runCheckout(cwd, { CNB_COMMIT: sourceSha }).status, 0);

  fs.writeFileSync(path.join(cwd, "untracked.txt"), "dirty\n");
  const dirty = runCheckout(cwd, { CNB_COMMIT: sourceSha });
  assert.equal(dirty.status, 1);
  assert.match(dirty.stderr, /必须从干净 checkout 开始/);
  fs.rmSync(path.join(cwd, "untracked.txt"));

  git(cwd, ["commit", "--allow-empty", "--quiet", "-m", "pre-merge"]);
  const mergeSha = git(cwd, ["rev-parse", "HEAD"]);
  const premerge = runCheckout(cwd, {
    CNB_COMMIT: sourceSha,
    CNB_PULL_REQUEST_LIKE: "true",
    CNB_PULL_REQUEST_MERGE_SHA: mergeSha,
  });
  assert.equal(premerge.status, 0, premerge.stderr);
});

test("main packages and publishes one linux amd64 application image", () => {
  assert.match(cnb, /rootlessBuildkitd:/);
  assert.equal((cnbRelease.match(/--file ops\/image\.Dockerfile/g) ?? []).length, 1);
  assert.match(cnbRelease, /--platform linux\/amd64/);
  assert.match(cnbRelease, /cache_ref="\$\{image_ref\}:buildcache-main"/);
  assert.doesNotMatch(cnbRelease, /\$\{CNB_REPO_SLUG_LOWERCASE\}-buildcache/);
  assert.match(cnbRelease, /--cache-from "type=registry,ref=\$\{cache_ref\}"/);
  assert.match(cnbRelease, /--cache-to "type=registry,ref=\$\{cache_ref\},mode=max"/);
  assert.match(cnbRelease, /--provenance=false/);
  assert.match(cnbRelease, /image_digest=/);
  assert.match(imageDockerfile, /COPY runtime\/ \.\//);
  assert.match(imageDockerfile, /COPY release\/ \/release\//);
  assert.doesNotMatch(imageDockerfile, /npm (ci|install|run)|next build|pnpm|yarn/);
});

test("the same CNB digest is verified, rehearsed, deployed and rollback protected", () => {
  for (const action of ["build", "verify", "rehearsal", "production"]) {
    assert.match(cnb, new RegExp(`cnb-release\\.sh ${action}`));
  }
  assert.match(cnbRelease, /docker pull "\$\{IMAGE_REF\}@\$\{IMAGE_DIGEST\}"/);
  assert.doesNotMatch(cnbRelease, /mirror|skopeo|ghcr/i);
  assert.match(cnb, /rollback-image\.sh/);
  assert.match(cnbDeploy, /approver:/);
  assert.match(deployImage, /PRODUCTION_IMAGE_DEPLOY_ENABLED/);
  assert.equal((cnb.match(/PRODUCTION_IMAGE_DEPLOY_ENABLED: "1"/g) ?? []).length, 2);
  assert.equal((cnb.match(/REMOTE_DIR: \/home\/ubuntu\/workspace/g) ?? []).length, 2);
  assert.equal((cnb.match(/HEALTHCHECK_URL: http:\/\/127\.0\.0\.1:3000\/workspace\/api\/internal\/health/g) ?? []).length, 2);
  assert.match(deployImage, /缺少生产部署输入/);
  assert.match(deployImage, /KEY or KEY_CONTENT/);
  assert.match(deployImage, /CNB_REGISTRY_TOKEN/);
  assert.match(deployImage, /CNB_REGISTRY_USER="\$\{CNB_REGISTRY_USER:-cnb\}"/);
  assert.match(deployImage, /login '\$remote_registry' -u '\$CNB_REGISTRY_USER' --password-stdin/);
  assert.doesNotMatch(deployImage, /CNB_TOKEN_USER_NAME|printf '%s' "\$CNB_TOKEN"/);
  assert.doesNotMatch(deployImage, /login '\$remote_registry' -u cnb/);
  assert.match(deployImage, /pg_dump/);
  assert.match(deployImage, /flock -n/);
  assert.match(deployImage, /online image digest mismatch/);
});

test("runtime image and artifact stay build-free and immutable", () => {
  assert.match(packager, /public\/company/);
  assert.match(packager, /public\/assets\/agent\/avatar/);
  assert.match(packager, /standalone public 目录包含未登记软链/);
  assert.equal(packageJson.scripts["check:precommit"], "node scripts/check/run-staged-precommit.mjs");
});
