import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  createTenantConfigManifest,
  installTenantConfig,
  verifyTenantConfigManifest,
} from "./tenant-config-manifest.mjs";

const fixtureRoot = resolve("scripts/check/fixtures/tenant-workspace");
const syncTenantConfig = readFileSync(new URL("./sync-tenant-config.sh", import.meta.url), "utf8");

function copyFixture(target) {
  cpSync(fixtureRoot, target, { recursive: true });
}

test("tenant config manifest follows profile references and detects drift", (context) => {
  const root = mkdtempSync(join(tmpdir(), "tenant-config-manifest-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  copyFixture(root);
  const profilePath = join(root, "config/tenant/profile.json");
  const profile = JSON.parse(readFileSync(profilePath, "utf8"));
  profile.docs.companyDocuments = [
    {
      key: "employee-handbook",
      title: "员工手册",
      description: "员工制度",
      format: "office",
      source: "tenant-file",
      file: "config/docs/company/员工手册.docx",
    },
    {
      key: "permission-actions",
      title: "权限 Action 授权手册",
      description: "权限说明",
      format: "paper",
      source: "permission-actions",
      file: "config/docs/company/permission-actions.md",
    },
  ];
  mkdirSync(join(root, "config/docs/company"), { recursive: true });
  writeFileSync(join(root, "config/docs/company/员工手册.docx"), "office fixture");
  writeFileSync(join(root, "config/docs/company/permission-actions.md"), "# action fixture\n");
  writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
  const manifest = createTenantConfigManifest(root);
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.kind, "workspace-tenant-config");
  assert.deepEqual(manifest.managedDirectories, ["data/docs-editor/templates/production-qc-snapshots"]);
  assert.ok(manifest.files.some((file) => file.path === "config/tenant/profile.json"));
  assert.ok(manifest.files.some((file) => file.path === "config/hr/ethnicities.json"));
  assert.ok(manifest.files.some((file) => file.path === "config/tenant/permission-review.json"));
  assert.ok(manifest.files.some((file) => file.path === "config/tenant/product-name-aliases.json"));
  assert.ok(manifest.files.some((file) => file.path === "data/docs-editor/templates/production-qc-snapshots/audit.json"));
  assert.ok(manifest.files.some((file) => file.path === "config/docs/company/员工手册.docx"));
  assert.ok(manifest.files.some((file) => file.path === "config/docs/company/permission-actions.md"));
  assert.equal(manifest.files.some((file) => file.path === "manifest.json"), false);
  verifyTenantConfigManifest(root, manifest);
  writeFileSync(join(root, "config/tenant/companies.json"), "[]\n");
  assert.throws(() => verifyTenantConfigManifest(root, manifest), /differs from deployment manifest/);
});

test("tenant config manifest rejects symlinked inputs", (context) => {
  const root = mkdtempSync(join(tmpdir(), "tenant-config-symlink-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  copyFixture(root);
  const companies = join(root, "config/tenant/companies.json");
  const body = readFileSync(companies);
  rmSync(companies);
  writeFileSync(join(root, "companies-copy.json"), body);
  symlinkSync(join(root, "companies-copy.json"), companies);
  assert.throws(() => createTenantConfigManifest(root), /must be a regular file/);
});

test("tenant config manifest rejects symlinks inside managed directories", (context) => {
  const root = mkdtempSync(join(tmpdir(), "tenant-config-directory-symlink-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  copyFixture(root);
  const qcRoot = join(root, "data/docs-editor/templates/production-qc-snapshots");
  writeFileSync(join(root, "linked-audit.json"), "{}\n");
  symlinkSync(join(root, "linked-audit.json"), join(qcRoot, "linked-audit.json"));
  assert.throws(() => createTenantConfigManifest(root), /managed directory contains a symlink/);
});

test("tenant config install verifies staging and preserves replaced files in backup", (context) => {
  const root = mkdtempSync(join(tmpdir(), "tenant-config-install-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const staging = join(root, "staging");
  const target = join(root, "target");
  const backup = join(root, "backup");
  copyFixture(staging);
  copyFixture(target);
  mkdirSync(join(staging, "assets/brand/company"), { recursive: true });
  writeFileSync(join(staging, "assets/brand/company/logo.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>\n");
  const manifest = createTenantConfigManifest(staging);
  const manifestPath = join(staging, ".deployment/tenant-config-manifest.json");
  mkdirSync(join(staging, ".deployment"), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  writeFileSync(join(target, "config/tenant/companies.json"), "[]\n");
  writeFileSync(join(target, "manifest.json"), "{\"retired\":true}\n");
  mkdirSync(join(target, "assets/brand/company"), { recursive: true });
  writeFileSync(join(target, "assets/brand/company/logo.png"), "old png");
  writeFileSync(
    join(target, "data/docs-editor/templates/production-qc-snapshots/stale.json"),
    "{\"stale\":true}\n",
  );
  installTenantConfig({ stagingRoot: staging, targetRoot: target, backupRoot: backup, manifest });
  verifyTenantConfigManifest(target, manifest);
  assert.equal(
    JSON.parse(readFileSync(join(target, ".deployment/tenant-config-manifest.json"), "utf8")).digest,
    manifest.digest,
  );
  assert.equal(readFileSync(join(backup, "config/tenant/companies.json"), "utf8"), "[]\n");
  assert.equal(readFileSync(join(backup, "manifest.json"), "utf8"), "{\"retired\":true}\n");
  assert.equal(existsSync(join(target, "manifest.json")), false);
  assert.equal(
    readFileSync(join(target, "assets/brand/company/logo.svg"), "utf8"),
    "<svg xmlns=\"http://www.w3.org/2000/svg\"/>\n",
  );
  assert.equal(existsSync(join(target, "assets/brand/company/logo.png")), false);
  assert.equal(readFileSync(join(backup, "assets/brand/company/logo.png"), "utf8"), "old png");
  assert.equal(
    readFileSync(join(backup, "data/docs-editor/templates/production-qc-snapshots/stale.json"), "utf8"),
    "{\"stale\":true}\n",
  );
  assert.equal(existsSync(join(target, "data/docs-editor/templates/production-qc-snapshots/stale.json")), false);
  assert.equal(JSON.parse(readFileSync(join(backup, "deployment-manifest.json"), "utf8")).digest, manifest.digest);
});

test("tenant config sync restores runtime ACLs after atomic installation", () => {
  const install = syncTenantConfig.indexOf('node \\"\\$tool\\" install');
  const reconcile = syncTenantConfig.indexOf('sudo -n -- bash \\"\\$reconciler\\"');
  assert.ok(install >= 0 && reconcile > install);
  assert.match(syncTenantConfig, /reconcile-runtime-config-permissions\.sh/);
  assert.match(syncTenantConfig, /'\$REMOTE_WORKSPACE_CONFIG_DIR' workspace-runtime/);
});
