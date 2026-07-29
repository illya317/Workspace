import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createFinanceAssetErpGlCutoverReconciler, isFinanceAssetErpGlCutoverReconciler } from "./erp-gl-cutover-provider";

test("brands only reconcilers created by the ERP GL factory", () => {
  const reconciler = createFinanceAssetErpGlCutoverReconciler({ archiveRoot: "/not-read", spec: spec(), cutoffDate: "2026-06-30" });
  assert.equal(isFinanceAssetErpGlCutoverReconciler(reconciler), true);
  assert.equal(isFinanceAssetErpGlCutoverReconciler(async () => ({})), false);
});

test("reconciles every account and assigns a sub-one-unit net balance tail to the largest card", async () => {
  const root = await fixture({ closing: 100, currentCredit: 10 });
  try {
    const reconcile = createFinanceAssetErpGlCutoverReconciler({
      archiveRoot: root,
      spec: spec(),
      cutoffDate: "2026-06-30",
    });
    const result = await reconcile(null, input(100.09));
    assert.equal(result.status, "rounding_allocated");
    assert.equal(result.allocations[0]?.openingNetBookValue, 100);
    assert.equal(result.allocations[0]?.openingAccumulatedAmount, 900);
    assert.equal(result.allocations[0]?.roundingAdjustment, -0.09);
    assert.equal(result.accountControls[0]?.allocatedAmount, 100);
    assert.equal(result.accountControls[0]?.difference, 0);
    assert.match(result.warnings.join("\n"), /根科目/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps a material unmapped balance pending instead of forcing it into a card", async () => {
  const root = await fixture({ closing: 67, currentCredit: 10 });
  try {
    const reconcile = createFinanceAssetErpGlCutoverReconciler({
      archiveRoot: root,
      spec: spec(),
      cutoffDate: "2026-06-30",
    });
    const result = await reconcile(null, input(100));
    assert.equal(result.status, "pending_allocation");
    assert.equal(result.allocations[0]?.allocationStatus, "pending");
    assert.equal(result.accountControls[0]?.difference, -33);
    assert.equal(result.unallocatedNetBookValue, -33);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("chooses the largest workbook net value, then sourceKey, as the sole tail target", async () => {
  const root = await fixture({ closing: 150, currentCredit: 10 });
  try {
    const reconcile = createFinanceAssetErpGlCutoverReconciler({ archiveRoot: root, spec: spec(), cutoffDate: "2026-06-30" });
    const result = await reconcile(null, twoCardInput());
    assert.deepEqual(result.allocations.map((row) => ({ sourceKey: row.sourceKey, rounding: row.roundingAdjustment })), [
      { sourceKey: "9&10-3:4", rounding: 0 },
      { sourceKey: "9&10-3:5", rounding: -0.09 },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("replaces one pure-net card from verified GL as an approved ledger control adjustment", async () => {
  const root = await fixture({ closing: 67, currentCredit: 10 });
  try {
    const reconcile = createFinanceAssetErpGlCutoverReconciler({
      archiveRoot: root,
      spec: spec(),
      cutoffDate: "2026-06-30",
      selector: () => ({ sourceAccountCode: "1801", allocationMode: "replace_single_card_from_gl", approvalReason: "已批准以总账期末余额承接" }),
    });
    const result = await reconcile(null, input(100));
    assert.equal(result.status, "ledger_control_adjusted");
    assert.equal(result.allocations[0]?.openingNetBookValue, 67);
    assert.equal(result.allocations[0]?.openingAccumulatedAmount, 933);
    assert.equal(result.allocations[0]?.ledgerControlAdjustment, -33);
    assert.equal(result.allocations[0]?.roundingAdjustment, 0);
    assert.equal(result.accountControls[0]?.difference, 0);
    assert.match(result.warnings.join("\n"), /已批准以总账期末余额承接/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects exceptional allocation for multiple cards, accumulated controls, or missing approval", async () => {
  const root = await fixture({ closing: 150, currentCredit: 10 });
  try {
    const approved = { sourceAccountCode: "1801", allocationMode: "replace_single_card_from_gl" as const, approvalReason: "审批依据" };
    await assert.rejects(
      createFinanceAssetErpGlCutoverReconciler({ archiveRoot: root, spec: spec(), cutoffDate: "2026-06-30", selector: () => approved })(null, twoCardInput()),
      /仅允许单卡资产科目控制/,
    );
    const accumulated = input(100);
    accumulated.authoritativeContext.balances[0]!.closingDebit = 150;
    accumulated.assets[0]!.accumulatedAccountId = 30;
    await assert.rejects(
      createFinanceAssetErpGlCutoverReconciler({ archiveRoot: root, spec: spec(), cutoffDate: "2026-06-30", selector: () => approved })(null, accumulated),
      /纯净额卡片/,
    );
    await assert.rejects(
      createFinanceAssetErpGlCutoverReconciler({ archiveRoot: root, spec: spec(), cutoffDate: "2026-06-30", selector: () => ({ sourceAccountCode: "1801", allocationMode: "replace_single_card_from_gl" }) })(null, twoCardInput()),
      /approvalReason/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects an approved subledger amount above the same-direction full GL balance", async () => {
  const root = await fixture({ closing: 67, currentCredit: 10 });
  try {
    const reconcile = createFinanceAssetErpGlCutoverReconciler({
      archiveRoot: root,
      spec: spec(),
      cutoffDate: "2026-06-30",
      selector: () => ({ sourceAccountCode: "1801", allocationMode: "approved_subledger_amount", approvedSelectedAmount: 67.01, approvalReason: "证据缺口经批准承接" }),
    });
    await assert.rejects(reconcile(null, input(100)), /超过同方向总账余额/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepts a missing ERP balance row only as an evidenced controlled zero", async () => {
  const root = await fixture({ closing: 100, currentCredit: 10 });
  try {
    const reconcile = createFinanceAssetErpGlCutoverReconciler({ archiveRoot: root, spec: spec(), cutoffDate: "2026-06-30" });
    const result = await reconcile(null, zeroAccumulatedInput());
    const zero = result.accountControls.find((control) => control.accountCode === "1702");
    assert.equal(zero?.selection, "controlled_zero");
    assert.equal(zero?.sourceSelectedAmount, 0);
    assert.match(result.warnings.join("\n"), /受控零余额协议/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a missing ERP balance row when Workspace is nonzero or an ERP voucher exists", async () => {
  const root = await fixture({ closing: 100, currentCredit: 10 });
  const activeRoot = await fixture({ closing: 100, currentCredit: 10, zeroAccountVoucher: true });
  try {
    const nonzero = zeroAccumulatedInput();
    nonzero.authoritativeContext.balances[1]!.closingCredit = 1;
    await assert.rejects(
      createFinanceAssetErpGlCutoverReconciler({ archiveRoot: root, spec: spec(), cutoffDate: "2026-06-30" })(null, nonzero),
      /Workspace 余额非零/,
    );
    await assert.rejects(
      createFinanceAssetErpGlCutoverReconciler({ archiveRoot: activeRoot, spec: spec(), cutoffDate: "2026-06-30" })(null, zeroAccumulatedInput()),
      /存在当期凭证/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(activeRoot, { recursive: true, force: true });
  }
});

function input(workbookNetBookValue: number) {
  return {
    companyCode: "TEST",
    companyId: 1,
    year: 2026,
    month: 6,
    cutoverDate: "2026-06-30",
    periodId: 6,
    authoritativeContext: {
      period: { id: 6, companyCode: "TEST", companyId: 1, year: 2026, month: 6, endDate: "2026-06-30", isClosed: true },
      balances: [{ id: 41, accountId: 30, periodId: 6, companyCode: "TEST", companyId: 1, accountCode: "1801", balanceDirection: "debit" as const, closingDebit: workbookNetBookValue === 100.09 ? 100 : 67, closingCredit: 0 }],
    },
    assets: [{
      sourceKey: "9&10-3:3",
      originalCost: 1_000,
      workbookNetBookValue,
      workbookAccumulatedAmount: 1_000 - workbookNetBookValue,
      fullUsefulLifeMonths: 12,
      remainingUsefulLifeMonthsAtCutover: 2,
      cutoverResidualValue: 0,
      assetAccountId: 30,
      accumulatedAccountId: null,
      impairmentAllowanceAccountId: null,
    }],
  };
}

function twoCardInput() {
  const base = input(100);
  return {
    ...base,
    authoritativeContext: {
      ...base.authoritativeContext,
      balances: [{ ...base.authoritativeContext.balances[0]!, closingDebit: 150 }],
    },
    assets: [
      { ...base.assets[0]!, sourceKey: "9&10-3:4", originalCost: 50.09, workbookNetBookValue: 50.09, workbookAccumulatedAmount: 0 },
      { ...base.assets[0]!, sourceKey: "9&10-3:5", originalCost: 100, workbookNetBookValue: 100, workbookAccumulatedAmount: 0 },
    ],
  };
}

function zeroAccumulatedInput() {
  const base = input(100.09);
  return {
    ...base,
    authoritativeContext: {
      ...base.authoritativeContext,
      balances: [
        base.authoritativeContext.balances[0]!,
        { id: 42, accountId: 31, periodId: 6, companyCode: "TEST", companyId: 1, accountCode: "1702", balanceDirection: "credit" as const, closingDebit: 0, closingCredit: 0 },
      ],
    },
    assets: [{
      ...base.assets[0]!,
      originalCost: 100,
      workbookNetBookValue: 100,
      workbookAccumulatedAmount: 0,
      accumulatedAccountId: 31 as number | null,
    }],
  };
}

function spec() {
  return { companyCode: "TEST", companyName: "测试", year: 2026, sourceSystem: "T6" as const, sourceLedger: "999", sourceDatabase: "UFDATA_999_2026", mappingMode: "recurring" as const, mappingStartYear: 2026 };
}

async function fixture(input: { closing: number; currentCredit: number; zeroAccountVoucher?: boolean }) {
  const root = await mkdtemp(join(tmpdir(), "finance-asset-erp-gl-"));
  const engine = join(root, "T6");
  const database = "UFDATA_999_2026";
  const dataDir = join(engine, "databases", database, "data");
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(root, "source-map.json"), JSON.stringify({ snapshotDate: "2026-07-22", cutoff: { date: "2026-06-30", isAccountingClose: true }, t6: { includedAccountSets: [{ id: "999", name: "测试", years: [2026, 2026] }] } }));
  const data = {
    GL_accsum: [{ ccode: "1801", iperiod: 6, cendd_c_engl: "Dr", me: input.closing, md: 0, mc: input.currentCredit }],
    GL_accass: [],
    GL_accvouch: [
      { ccode: "180101", iperiod: 6, md: 0, mc: input.currentCredit, ibook: 1, bdelete: false },
      ...(input.zeroAccountVoucher ? [{ ccode: "1702", iperiod: 6, md: 0, mc: 1, ibook: 1, bdelete: false }] : []),
    ],
    code: [{ ccode: "1801", ccode_name: "长期待摊费用", bproperty: true, bend: false }, { ccode: "180101", ccode_name: "装修费", bproperty: true, bend: true }, { ccode: "1702", ccode_name: "累计摊销", bproperty: false, bend: true }],
  };
  const manifest: string[] = [];
  const checksums: string[] = [];
  for (const [table, rows] of Object.entries(data)) {
    const relative = `databases/${database}/data/${table}.jsonl`;
    const text = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
    await writeFile(join(engine, relative), text);
    manifest.push(JSON.stringify({ database, table, status: "ok", rows: rows.length, data: relative }));
    checksums.push(`${createHash("sha256").update(text).digest("hex")}  ${relative}`);
  }
  await writeFile(join(engine, "manifest.jsonl"), `${manifest.join("\n")}\n`);
  await writeFile(join(engine, "SHA256SUMS.txt"), `${checksums.join("\n")}\n`);
  await writeFile(join(engine, "validation-summary.json"), JSON.stringify({ manifestEntries: manifest.length, missingTables: 0, errorTables: 0, errors: [] }));
  return root;
}
