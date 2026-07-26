import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateExecutableManifest } from "./apply-data-release.mjs";
import { buildDataReleaseHandlerCommand } from "./data-release-handlers.mjs";
import { inspectPrivateDataRelease, inspectStagedDataRelease } from "./data-release-transfer.mjs";

const releaseId = "2026-01-01-synthetic-v1";

function privateBundle() {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-private-data-release-"));
  const manifestRoot = path.join(root, "data-release-manifests");
  const sourceRoot = path.join(root, "data-release-sources", releaseId);
  mkdirSync(manifestRoot, { recursive: true });
  mkdirSync(path.join(sourceRoot, "raw"), { recursive: true });
  const source = Buffer.from("synthetic private source");
  writeFileSync(path.join(sourceRoot, "raw/source.bin"), source);
  const manifest = {
    schemaVersion: 1,
    id: releaseId,
    sources: [{ id: "source", stagedPath: "raw/source.bin", sha256: createHash("sha256").update(source).digest("hex") }],
  };
  writeFileSync(path.join(manifestRoot, `${releaseId}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, manifest, sourceRoot };
}

test("private release sources are pinned by safe paths and SHA-256", () => {
  const fixture = privateBundle();
  const descriptor = inspectPrivateDataRelease({ configRoot: fixture.root, id: releaseId });
  assert.equal(descriptor.releaseId, releaseId);
  assert.equal(descriptor.files.length, 1);
  writeFileSync(path.join(fixture.sourceRoot, "raw/source.bin"), "drifted");
  assert.throws(() => inspectPrivateDataRelease({ configRoot: fixture.root, id: releaseId }), /sha256 differs/);
});

test("staged bundles reject symlinks and preserve the private payload digest", () => {
  const fixture = privateBundle();
  const expected = inspectPrivateDataRelease({ configRoot: fixture.root, id: releaseId });
  const staged = mkdtempSync(path.join(os.tmpdir(), "workspace-staged-data-release-"));
  mkdirSync(path.join(staged, "sources"));
  cpSync(path.join(fixture.root, "data-release-manifests", `${releaseId}.json`), path.join(staged, "manifest.json"));
  cpSync(fixture.sourceRoot, path.join(staged, "sources"), { recursive: true });
  assert.equal(inspectStagedDataRelease({ bundleRoot: staged, id: releaseId }).payloadDigest, expected.payloadDigest);
  const source = path.join(staged, "sources/raw/source.bin");
  const body = readFileSync(source);
  writeFileSync(path.join(staged, "outside.bin"), body);
  symlinkSync(path.join(staged, "outside.bin"), `${source}.link`);
  const manifest = JSON.parse(readFileSync(path.join(staged, "manifest.json"), "utf8"));
  manifest.sources.push({ ...manifest.sources[0], id: "link", stagedPath: "raw/source.bin.link" });
  writeFileSync(path.join(staged, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  assert.throws(() => inspectStagedDataRelease({ bundleRoot: staged, id: releaseId }), /regular file/);
});

test("executable manifests select a registered handler instead of a script path", () => {
  const manifest = validateExecutableManifest({
    schemaVersion: 2,
    id: releaseId,
    execution: {
      handler: "product-master-v1",
      parameters: { companyCode: "C01", inputDirectory: "raw", aliasFile: "aliases.json" },
    },
    checks: [{ id: "count", sql: "SELECT count(*)::text FROM \"Product\"", expected: "1" }],
  }, releaseId);
  const command = buildDataReleaseHandlerCommand(manifest.execution, {
    repositoryRoot: "/srv/release",
    sourceRoot: "/srv/private/sources",
  });
  assert.equal(command.executable, process.execPath);
  assert.ok(command.args.includes("--company-code=C01"));
  assert.throws(() => validateExecutableManifest({ ...manifest, checks: [{ id: "write", sql: "DELETE FROM product", expected: "" }] }, releaseId), /SELECT\/CTE/);
  assert.throws(() => buildDataReleaseHandlerCommand({ handler: "private-script", parameters: {} }, {
    repositoryRoot: "/srv/release",
    sourceRoot: "/srv/private/sources",
  }), /not registered/);
});
