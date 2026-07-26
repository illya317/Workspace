#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  DEFAULT_EXCLUDED_SCOPES,
  collectTenantSignals,
  evaluateBaseline,
  loadTenantScanInput,
  resolveWorkspaceConfigDir,
  scanRepository,
} = require("./tenant-hardcoding-scanner");

const root = path.resolve(__dirname, "../..");
const baselinePath = path.join(__dirname, "company-hardcoding-baseline.json");

function main() {
  try {
    const workspaceConfigDir = resolveWorkspaceConfigDir(root, process.env);
    const tenantInput = loadTenantScanInput(workspaceConfigDir);
    const signals = collectTenantSignals(tenantInput);
    const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    if (JSON.stringify(baseline.excludedScopes) !== JSON.stringify(DEFAULT_EXCLUDED_SCOPES)) {
      throw new Error("Tenant hardcoding excluded scopes drifted from the reviewed scanner classification");
    }
    const result = scanRepository({ root, signals, excludedScopes: baseline.excludedScopes });
    const ratchet = evaluateBaseline(result.violations, baseline.activeViolations);

    for (const violation of result.violations) {
      console.error(`✗ ${violation.key}`);
      console.error(`  ${violation.message}`);
    }
    if (ratchet.stale.length > 0) {
      console.error("✗ Tenant hardcoding baseline contains stale active entries; remove them:");
      for (const item of ratchet.stale) console.error(`  - ${item}`);
    }

    console.log(`Tenant hardcoding scan: ${result.scannedFiles} files, ${signals.length} tenant signals, ${result.violations.length} active violations.`);
    console.log(`Tenant config: ${path.join(workspaceConfigDir, "config/tenant/profile.json")}`);
    if (ratchet.additions.length > 0 || ratchet.stale.length > 0) {
      console.error("✗ company:check failed. Move tenant facts to WORKSPACE_CONFIG_DIR or remove migrated baseline entries.");
      return 1;
    }
    console.log("✓ company:check passed with a zero active-runtime baseline.");
    return 0;
  } catch (error) {
    console.error("✗ company:check could not run.");
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (require.main === module) process.exit(main());

module.exports = { main };
