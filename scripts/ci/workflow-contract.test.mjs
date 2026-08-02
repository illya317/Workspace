import assert from "node:assert/strict";
import fs from "node:fs";
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

test("CNB is the only source CI, image builder, registry and CD platform", () => {
  assert.equal(fs.existsSync(new URL("../../.github/workflows/ci.yml", import.meta.url)), false);
  assert.match(cnb, /^main:\n  pull_request:/m);
  assert.match(cnb, /^  push:/m);
  assert.doesNotMatch(`${cnb}\n${cnbCi}\n${cnbRelease}`, /github|ghcr\.io|GITHUB_|GHCR_|skopeo/i);
});

test("PR and main restore the versioned dependency image and share one required CI interface", () => {
  assert.equal((cnb.match(/restore-dependencies/g) ?? []).length, 2);
  assert.equal((cnb.match(/cnb-ci\.sh setup/g) ?? []).length, 2);
  assert.equal((cnb.match(/cnb-ci\.sh required/g) ?? []).length, 2);
  assert.doesNotMatch(cnbCi, /npm ci|playwright install/);
  assert.equal((cnbCiCache.match(/npm ci --no-audit/g) ?? []).length, 1);
  assert.match(cnbCiCache, /PLAYWRIGHT_BROWSERS_PATH=\/ms-playwright/);
  assert.match(cnbCiCache, /playwright install --with-deps chromium/);
  assert.match(cnb, /package-lock\.json[\s\S]*ops\/cnb-ci-cache\.Dockerfile/);
  assert.match(cnb, /copy-on-write-read-only/);
  assert.match(cnb, /main:\/workspace\/\.next\/cache:copy-on-write/);
  assert.match(cnbCi, /npm run check:ci/);
  assert.match(cnbCi, /STANDALONE_SKIP_NEXT_BUILD=1/);
  assert.match(cnbCi, /npm run test:integration:postgresql/);
  assert.match(cnbCi, /PLAYWRIGHT_STANDALONE_ARCHIVE=/);
  assert.match(cnbCi, /npm run test:e2e:smoke/);
  assert.match(cnbCi, /CNB required summary/);
  assert.match(cnbCi, /blocked:/);
});

test("main packages and publishes one linux amd64 application image", () => {
  assert.match(cnb, /rootlessBuildkitd:/);
  assert.equal((cnbRelease.match(/--file ops\/image\.Dockerfile/g) ?? []).length, 1);
  assert.match(cnbRelease, /--platform linux\/amd64/);
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
