import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { normalizeRuntimeTree } from "../artifact/runtime-tree-permissions.mjs";
import {
  assertArtifactStaticAcceptance,
  createArtifactStaticAcceptance,
  validateArtifactStaticAcceptance,
} from "./artifact-static-acceptance.mjs";

const CONTENT_DIGEST = "a".repeat(64);
const HAS_GNU_TAR = execFileSync("tar", ["--help"], { encoding: "utf8" }).includes("--full-time");

function fixture(t, buildId = CONTENT_DIGEST, permissions = {}) {
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
  normalizeRuntimeTree(runtime);
  if (permissions.rootMode) fs.chmodSync(runtime, permissions.rootMode);
  if (permissions.serverMode) fs.chmodSync(path.join(runtime, "server.js"), permissions.serverMode);
  const artifact = path.join(root, "artifact.tgz");
  const manifest = path.join(root, "manifest.json");
  execFileSync("tar", ["-C", runtime, "-czf", artifact, "."]);
  fs.writeFileSync(manifest, JSON.stringify({
    source: { contentDigest: CONTENT_DIGEST },
    artifact: {
      sha256: createHash("sha256").update(fs.readFileSync(artifact)).digest("hex"),
      sizeBytes: fs.statSync(artifact).size,
    },
  }));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { artifact, manifest };
}

test("runs real archive inspection for a monolith artifact", { skip: !HAS_GNU_TAR && "requires the production GNU tar contract" }, (t) => {
  const input = fixture(t);
  const result = assertArtifactStaticAcceptance({ ...input, target: "monolith" });
  assert.equal(result.buildId, CONTENT_DIGEST);
  assert.equal(result.basePath, "/workspace");
});

test("writes one exact static receipt for rehearsal and Ready reuse", { skip: !HAS_GNU_TAR && "requires the production GNU tar contract" }, (t) => {
  const input = fixture(t);
  const output = path.join(path.dirname(input.artifact), "static-acceptance.json");
  const receipt = createArtifactStaticAcceptance({ ...input, target: "monolith", output });
  assert.equal(validateArtifactStaticAcceptance(receipt, { ...input, target: "monolith" }), receipt);
  assert.equal(JSON.parse(fs.readFileSync(output, "utf8")).receiptDigest, receipt.receiptDigest);
  fs.appendFileSync(input.artifact, "tamper");
  assert.throws(
    () => validateArtifactStaticAcceptance(receipt, { ...input, target: "monolith" }),
    /does not match the exact artifact/,
  );
});

test("rejects an archive whose BUILD_ID differs from its manifest", { skip: !HAS_GNU_TAR && "requires the production GNU tar contract" }, (t) => {
  const input = fixture(t, "b".repeat(64));
  assert.throws(
    () => assertArtifactStaticAcceptance({ ...input, target: "monolith" }),
    /artifact BUILD_ID differs from manifest/,
  );
});

test("rejects an unnormalized archive with an umask-077 runtime directory", { skip: !HAS_GNU_TAR && "requires the production GNU tar contract" }, (t) => {
  const input = fixture(t, CONTENT_DIGEST, { rootMode: 0o700 });
  assert.throws(
    () => assertArtifactStaticAcceptance({ ...input, target: "monolith" }),
    /directory is not isolated-user traversable/,
  );
});

test("rejects an unnormalized archive with an umask-077 runtime file", { skip: !HAS_GNU_TAR && "requires the production GNU tar contract" }, (t) => {
  const input = fixture(t, CONTENT_DIGEST, { serverMode: 0o600 });
  assert.throws(
    () => assertArtifactStaticAcceptance({ ...input, target: "monolith" }),
    /file is not isolated-user readable/,
  );
});

test("rejects a 0754 runtime directory outside the exact archive contract", { skip: !HAS_GNU_TAR && "requires the production GNU tar contract" }, (t) => {
  const input = fixture(t, CONTENT_DIGEST, { rootMode: 0o754 });
  assert.throws(
    () => assertArtifactStaticAcceptance({ ...input, target: "monolith" }),
    /exact 0755 mode/,
  );
});

test("rejects a 0644 runtime file outside the exact archive contract", { skip: !HAS_GNU_TAR && "requires the production GNU tar contract" }, (t) => {
  const input = fixture(t, CONTENT_DIGEST, { serverMode: 0o644 });
  assert.throws(
    () => assertArtifactStaticAcceptance({ ...input, target: "monolith" }),
    /not exact 0444 or 0555/,
  );
});
