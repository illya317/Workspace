import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { normalizeImageRelease } from "./image-release-manifest.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;

function fixture() {
  const unsigned = {
    schemaVersion: 1,
    kind: "workspace-oci-release",
    source: { commitSha: "1".repeat(40), treeSha: "2".repeat(40), contentDigest: "3".repeat(64) },
    image: { ref: "docker.cnb.cool/illya317/workspace", digest: `sha256:${"4".repeat(64)}`, platform: "linux/amd64" },
    artifact: { sha256: "5".repeat(64), manifestSha256: "6".repeat(64) },
    migration: { head: "20260801011000_example", setSha256: "7".repeat(64) },
    build: { provider: "cnb", requiredCheck: "CNB / required", requiredConclusion: "success", runId: "cnb-sr8-example", event: "push", createdAt: "2026-08-02T00:00:00.000Z" },
  };
  return { ...unsigned, releaseDigest: sha256(JSON.stringify(canonical(unsigned))) };
}

test("release manifest binds source, tree, CNB image digest, migration and CNB build", () => {
  const value = fixture();
  assert.equal(normalizeImageRelease(value), value);
});

test("release manifest rejects mutable tags and digest drift", () => {
  const mutable = fixture();
  mutable.image.ref = `${mutable.image.ref}:latest`;
  mutable.image.digest = "latest";
  assert.throws(() => normalizeImageRelease(mutable), /immutable linux\/amd64 digest/);
  const drifted = fixture();
  drifted.source.treeSha = "8".repeat(40);
  assert.throws(() => normalizeImageRelease(drifted), /release\.json digest/);
});

test("release manifest remains ordinary portable JSON", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-release-json-"));
  const file = path.join(root, "release.json");
  writeFileSync(file, `${JSON.stringify(fixture(), null, 2)}\n`);
  assert.equal(normalizeImageRelease(JSON.parse(readFileSync(file, "utf8"))).kind, "workspace-oci-release");
});
