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

test("finance auxiliary identity releases use the registered repair handler", () => {
  const command = buildDataReleaseHandlerCommand({
    handler: "finance-auxiliary-identity-links-v1",
    parameters: { inputFile: "finance/auxiliary-identities.json" },
  }, {
    repositoryRoot: "/repo",
    sourceRoot: "/private/sources",
  });
  assert.equal(command.executable, process.execPath);
  assert.deepEqual(command.args.slice(0, 4), [
    "--conditions=react-server",
    "--import",
    "tsx",
    "/repo/scripts/repair/repair-finance-auxiliary-identity-links.ts",
  ]);
  assert.equal(command.args.at(-1), "--input-file=/private/sources/finance/auxiliary-identities.json");
});

test("finance budget releases use private workbooks and a pinned reference map", () => {
  const command = buildDataReleaseHandlerCommand({
    handler: "finance-budget-v1",
    parameters: {
      companyCode: "C01",
      year: 2026,
      versionName: "2026 初始预算",
      departmentFile: "finance/department-budget.xlsx",
      researchFile: "finance/research-budget.xlsx",
      referenceFile: "finance/budget-references.json",
    },
  }, {
    repositoryRoot: "/srv/release",
    sourceRoot: "/srv/private/sources",
    releaseId,
  });
  assert.equal(command.executable, process.execPath);
  assert.ok(command.args.includes(`--release-id=${releaseId}`));
  assert.ok(command.args.includes("--department-file=/srv/private/sources/finance/department-budget.xlsx"));
  assert.ok(command.args.includes("--reference-file=/srv/private/sources/finance/budget-references.json"));
  assert.throws(() => buildDataReleaseHandlerCommand({
    handler: "finance-budget-v1",
    parameters: {
      companyCode: "C01",
      year: 2026,
      versionName: "bad",
      departmentFile: "../outside.xlsx",
      researchFile: "finance/research-budget.xlsx",
      referenceFile: "finance/budget-references.json",
    },
  }, {
    repositoryRoot: "/srv/release",
    sourceRoot: "/srv/private/sources",
    releaseId,
  }), /escapes/);
});

test("June finance close cutover uses one pinned private payload", () => {
  const command = buildDataReleaseHandlerCommand({
    handler: "finance-june-close-cutover-v1",
    parameters: { inputFile: "finance/june-close-2026-06/cutover.json" },
  }, {
    repositoryRoot: "/srv/release",
    sourceRoot: "/srv/private/sources",
    releaseId: "finance-june-close-2026-06-v1",
  });
  assert.equal(command.executable, process.execPath);
  assert.ok(command.args.includes("--execute"));
  assert.ok(command.args.includes("--release-id=finance-june-close-2026-06-v1"));
  assert.ok(command.args.includes("--input-file=/srv/private/sources/finance/june-close-2026-06/cutover.json"));
  assert.throws(() => buildDataReleaseHandlerCommand({
    handler: "finance-june-close-cutover-v1",
    parameters: { inputFile: "../outside.json" },
  }, {
    repositoryRoot: "/srv/release",
    sourceRoot: "/srv/private/sources",
    releaseId: "finance-june-close-2026-06-v1",
  }), /escapes/);
});

test("finance reviewed-origin repairs use a pinned private input file", () => {
  const command = buildDataReleaseHandlerCommand({
    handler: "finance-reviewed-origin-mappings-v1",
    parameters: { inputFile: "finance/reviewed-origin-mappings.json" },
  }, {
    repositoryRoot: "/srv/release",
    sourceRoot: "/srv/private/sources",
  });
  assert.equal(command.executable, process.execPath);
  assert.ok(command.args.includes("--execute"));
  assert.ok(command.args.includes("--input-file=/srv/private/sources/finance/reviewed-origin-mappings.json"));
  assert.throws(() => buildDataReleaseHandlerCommand({
    handler: "finance-reviewed-origin-mappings-v1",
    parameters: { inputFile: "../outside.json" },
  }, {
    repositoryRoot: "/srv/release",
    sourceRoot: "/srv/private/sources",
  }), /escapes/);
});

test("finance consolidation vouchers use a pinned private input file", () => {
  const command = buildDataReleaseHandlerCommand({
    handler: "finance-consolidation-voucher-v1",
    parameters: { inputFile: "finance/consolidation-voucher.json" },
  }, {
    repositoryRoot: "/srv/release",
    sourceRoot: "/srv/private/sources",
  });
  assert.equal(command.executable, process.execPath);
  assert.ok(command.args.includes("--execute"));
  assert.ok(command.args.includes("--input-file=/srv/private/sources/finance/consolidation-voucher.json"));
  assert.throws(() => buildDataReleaseHandlerCommand({
    handler: "finance-consolidation-voucher-v1",
    parameters: { inputFile: "../outside.json" },
  }, {
    repositoryRoot: "/srv/release",
    sourceRoot: "/srv/private/sources",
  }), /escapes/);
});

test("finance consolidation entry migrations use a pinned private input file", () => {
  const command = buildDataReleaseHandlerCommand({
    handler: "finance-consolidation-entry-migration-v1",
    parameters: { inputFile: "finance/consolidation-entry-migration.json" },
  }, {
    repositoryRoot: "/srv/release",
    sourceRoot: "/srv/private/sources",
  });
  assert.equal(command.executable, process.execPath);
  assert.deepEqual(command.args, [
    "/srv/release/scripts/repair/repair-finance-consolidation-entry.mjs",
    "--execute",
    "--input-file=/srv/private/sources/finance/consolidation-entry-migration.json",
  ]);
  assert.throws(() => buildDataReleaseHandlerCommand({
    handler: "finance-consolidation-entry-migration-v1",
    parameters: { inputFile: "../outside.json" },
  }, {
    repositoryRoot: "/srv/release",
    sourceRoot: "/srv/private/sources",
  }), /escapes/);
});

test("HR lifecycle compatibility repairs use a pinned private input file", () => {
  const command = buildDataReleaseHandlerCommand({
    handler: "hr-lifecycle-compatibility-v1",
    parameters: { inputFile: "hr/lifecycle-compatibility.json" },
  }, {
    repositoryRoot: "/srv/release",
    sourceRoot: "/srv/private/sources",
  });
  assert.equal(command.executable, process.execPath);
  assert.ok(command.args.includes("--execute"));
  assert.ok(command.args.includes("--input-file=/srv/private/sources/hr/lifecycle-compatibility.json"));
  assert.throws(() => buildDataReleaseHandlerCommand({
    handler: "hr-lifecycle-compatibility-v1",
    parameters: { inputFile: "../outside.json" },
  }, {
    repositoryRoot: "/srv/release",
    sourceRoot: "/srv/private/sources",
  }), /escapes/);
});

test("HR organization baseline compatibility repairs use a pinned private input file", () => {
  const command = buildDataReleaseHandlerCommand({
    handler: "hr-organization-baseline-compatibility-v1",
    parameters: { inputFile: "hr/organization-baseline-compatibility.json" },
  }, {
    repositoryRoot: "/srv/release",
    sourceRoot: "/srv/private/sources",
  });
  assert.equal(command.executable, process.execPath);
  assert.ok(command.args.includes("--execute"));
  assert.ok(command.args.includes("--input-file=/srv/private/sources/hr/organization-baseline-compatibility.json"));
  assert.throws(() => buildDataReleaseHandlerCommand({
    handler: "hr-organization-baseline-compatibility-v1",
    parameters: { inputFile: "../outside.json" },
  }, {
    repositoryRoot: "/srv/release",
    sourceRoot: "/srv/private/sources",
  }), /escapes/);
});

test("HR employment agreement baselines use a pinned private input file", () => {
  const command = buildDataReleaseHandlerCommand({
    handler: "hr-employment-agreement-baseline-v1",
    parameters: { inputFile: "hr/employment-agreement-baseline.json" },
  }, {
    repositoryRoot: "/srv/release",
    sourceRoot: "/srv/private/sources",
  });
  assert.equal(command.executable, process.execPath);
  assert.ok(command.args.includes("--execute"));
  assert.ok(command.args.includes("--input-file=/srv/private/sources/hr/employment-agreement-baseline.json"));
  assert.throws(() => buildDataReleaseHandlerCommand({
    handler: "hr-employment-agreement-baseline-v1",
    parameters: { inputFile: "../outside.json" },
  }, {
    repositoryRoot: "/srv/release",
    sourceRoot: "/srv/private/sources",
  }), /escapes/);
});

test("HR social insurance baselines use a pinned private input file", () => {
  const command = buildDataReleaseHandlerCommand({
    handler: "hr-social-insurance-baseline-v1",
    parameters: { inputFile: "hr/social-insurance-baseline.json" },
  }, {
    repositoryRoot: "/srv/release",
    sourceRoot: "/srv/private/sources",
  });
  assert.ok(command.args.includes("--execute"));
  assert.ok(command.args.includes("--input-file=/srv/private/sources/hr/social-insurance-baseline.json"));
});
