import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { provisionWorkspace } from "./provision-workspace.mjs";

function options(overrides = {}) {
  return {
    tenant_key: "example-industries",
    company_code: "EX01",
    company_name: "Example Industries",
    app_name: "Example Workspace",
    time_zone: "UTC",
    ...overrides,
  };
}

test("workspace provisioning creates a schema-valid neutral tenant package", (context) => {
  const parent = mkdtempSync(path.join(tmpdir(), "workspace-provision-"));
  context.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, ".workspace");

  const result = provisionWorkspace(root, options());
  assert.equal(result.written.length, 13);
  assert.equal(existsSync(path.join(root, ".env")), false);
  assert.equal(existsSync(path.join(root, "assets/brand/company/logo.png")), false);
  assert.equal(existsSync(path.join(root, "assets/brand/company/logo.svg")), true);

  const profile = JSON.parse(readFileSync(path.join(root, "config/tenant/profile.json"), "utf8"));
  const companies = JSON.parse(readFileSync(path.join(root, "config/tenant/companies.json"), "utf8"));
  assert.equal(profile.key, "example-industries");
  assert.equal(profile.identity.companyName, "Example Industries");
  assert.equal(companies[0].code, "EX01");
  assert.deepEqual(profile.docs.officialQcProductKeys, []);

  assert.equal(result.manifest.files.length, 12);
  assert.ok(result.manifest.managedDirectories.includes("assets/brand/company"));
  assert.ok(result.manifest.files.some((file) => file.path.endsWith("production-qc-snapshots/audit.json")));
  assert.ok(result.manifest.files.some((file) => file.path === "assets/brand/company/logo.svg"));
  assert.match(readFileSync(path.join(root, "assets/brand/company/logo.svg"), "utf8"), /Example Industries/);
});

test("workspace provisioning refuses to overwrite an existing tenant", (context) => {
  const parent = mkdtempSync(path.join(tmpdir(), "workspace-provision-existing-"));
  context.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, ".workspace");

  provisionWorkspace(root, options());
  assert.throws(() => provisionWorkspace(root, options()), /already provisioned/);
});

test("workspace provisioning validates tenant identity arguments", (context) => {
  const parent = mkdtempSync(path.join(tmpdir(), "workspace-provision-invalid-"));
  context.after(() => rmSync(parent, { recursive: true, force: true }));

  assert.throws(
    () => provisionWorkspace(path.join(parent, "one"), options({ tenant_key: "A" })),
    /tenant-key/,
  );
  assert.throws(
    () => provisionWorkspace(path.join(parent, "two"), options({ time_zone: "Mars/Olympus" })),
    /time-zone/,
  );
});
