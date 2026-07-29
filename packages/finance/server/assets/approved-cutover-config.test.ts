import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createExecutionApprovedFinanceAssetErpGlCutoverReconciler,
  getApprovedFinanceAssetLegacySyntheticAssets,
  isExecutionApprovedGovernedReconciler,
  loadApprovedFinanceAssetCutoverConfig,
} from "./approved-cutover-config";
import { createFinanceAssetErpGlCutoverReconciler } from "./erp-gl-cutover-provider";
import type { FinanceAssetLegacySyntheticAsset } from "./legacy-synthetic-assets";

const scope = { companyCode: "TEST", year: 2026, month: 6 };

test("only a current-user 0600 file outside cwd can create an execution-approved reconciler", async () => {
  const root = await mkdtemp(join(tmpdir(), "approved-asset-cutover-"));
  try {
    const configPath = join(root, "approved.json");
    await writeFile(configPath, JSON.stringify(config()), { mode: 0o600 });
    const approved = await loadApprovedFinanceAssetCutoverConfig(configPath, scope);
    const governed = createExecutionApprovedFinanceAssetErpGlCutoverReconciler(approved, "asset-importer");
    assert.equal(isExecutionApprovedGovernedReconciler(governed), true);
    assert.throws(() => Object.assign(approved, { approvalReference: "FORGED" }), /extensible|read only|Cannot add property/);
    const syntheticAssets = getApprovedFinanceAssetLegacySyntheticAssets(approved);
    assert.throws(() => (syntheticAssets as FinanceAssetLegacySyntheticAsset[]).push({} as FinanceAssetLegacySyntheticAsset), /extensible|read only|object is not extensible/);
    assert.throws(() => Object.assign(syntheticAssets[0]!, { closingNet: 1 }), /read only|Cannot assign/);
    const raw = createFinanceAssetErpGlCutoverReconciler({ archiveRoot: "/not-read", cutoffDate: "2026-06-30", spec: { companyCode: "TEST", companyName: "测试", year: 2026, sourceSystem: "T6", sourceLedger: "999", sourceDatabase: "UFDATA_999_2026", mappingMode: "recurring", mappingStartYear: 2026 } });
    assert.equal(isExecutionApprovedGovernedReconciler(raw), false);
    assert.throws(() => createExecutionApprovedFinanceAssetErpGlCutoverReconciler({ ...approved }, "asset-importer"), /opaque config/);
    await chmod(configPath, 0o644);
    await assert.rejects(() => loadApprovedFinanceAssetCutoverConfig(configPath, scope), /权限必须为 0600/);
    await chmod(configPath, 0o600);
    const linkPath = join(root, "link.json");
    await symlink(configPath, linkPath);
    await assert.rejects(() => loadApprovedFinanceAssetCutoverConfig(linkPath, scope), /symlink/);
    const projectRoot = process.cwd();
    process.chdir(join(projectRoot, "packages"));
    try {
      assert.ok(await loadApprovedFinanceAssetCutoverConfig(configPath, scope));
      await assert.rejects(() => loadApprovedFinanceAssetCutoverConfig(join(projectRoot, "approved.json"), scope), /worktree\/cwd/);
    } finally {
      process.chdir(projectRoot);
    }
    const siblingRepo = join(root, "sibling-repo");
    await mkdir(join(siblingRepo, ".git"), { recursive: true });
    const siblingConfig = join(siblingRepo, "approved.json");
    await writeFile(siblingConfig, JSON.stringify(config()), { mode: 0o600 });
    const siblingApproved = await loadApprovedFinanceAssetCutoverConfig(siblingConfig, scope);
    assert.equal(isExecutionApprovedGovernedReconciler(createExecutionApprovedFinanceAssetErpGlCutoverReconciler(siblingApproved, "asset-importer")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function config() {
  return {
    executionApproved: true,
    approvalReference: "APR-2026-06",
    approvedBy: "finance-controller",
    archiveRoot: "/private/archive",
    cutoffDate: "2026-06-30",
    companies: {
      TEST: {
        companyName: "测试公司",
        sourceSystem: "T6",
        sourceLedger: "999",
        sourceDatabase: "UFDATA_999_2026",
        mappingMode: "recurring",
        mappingStartYear: 2026,
        selectors: [],
        legacySyntheticAssets: [{ sourceKey: "9&10-3:29", sourceSheet: "9&10-3", sourceRange: "9&10-3!A18:E29", name: "装修", category: "LT-LEASEHOLD", assetKind: "long_term_deferred", originalCost: 100, closingNet: 10, fullUsefulLife: 60, approvalReason: "批准" }],
      },
    },
  };
}
