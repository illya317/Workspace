import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { assertArtifactStaticAcceptance } from "./artifact-static-acceptance.mjs";

const CONTENT_DIGEST = "a".repeat(64);
const HAS_GNU_TAR = execFileSync("tar", ["--help"], { encoding: "utf8" }).includes("--full-time");

function fixture(t, buildId = CONTENT_DIGEST) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-static-acceptance-"));
  const runtime = path.join(root, "runtime");
  const write = (relative, value = "") => {
    const file = path.join(runtime, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
  };
  write(".server-entry", "server.js\n");
  write("server.js", "console.log('ready');\n");
  write(".next/BUILD_ID", `${buildId}\n`);
  write(".next/routes-manifest.json", JSON.stringify({ basePath: "/workspace" }));
  for (const required of [
    "prisma/schema.prisma",
    "prisma/migrations/migration_lock.toml",
    "node_modules/prisma/build/index.js",
    "seed-resources-runtime.mjs",
    "scripts/check/check-prisma-deploy-status.js",
    "ops/apply-data-release.mjs",
  ]) write(required);
  const artifact = path.join(root, "artifact.tgz");
  const manifest = path.join(root, "manifest.json");
  execFileSync("tar", ["-C", runtime, "-czf", artifact, "."]);
  fs.writeFileSync(manifest, JSON.stringify({ source: { contentDigest: CONTENT_DIGEST } }));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { artifact, manifest };
}

test("runs real archive inspection for a monolith artifact", { skip: !HAS_GNU_TAR && "requires the production GNU tar contract" }, (t) => {
  const input = fixture(t);
  const result = assertArtifactStaticAcceptance({ ...input, target: "monolith" });
  assert.equal(result.buildId, CONTENT_DIGEST);
  assert.equal(result.basePath, "/workspace");
});

test("rejects an archive whose BUILD_ID differs from its manifest", { skip: !HAS_GNU_TAR && "requires the production GNU tar contract" }, (t) => {
  const input = fixture(t, "b".repeat(64));
  assert.throws(
    () => assertArtifactStaticAcceptance({ ...input, target: "monolith" }),
    /artifact BUILD_ID differs from manifest/,
  );
});
