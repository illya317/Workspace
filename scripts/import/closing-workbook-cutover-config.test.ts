import assert from "node:assert/strict";
import test from "node:test";

import { bindClosingWorkbookExecution, buildClosingWorkbookCutoverOptions, requireClosingWorkbookActor } from "./closing-workbook-cutover-config";

const scope = { companyCode: "TEST", year: 2026, month: 6 };
const approval = { executionApproved: true as const, approvalReference: "APR-2026-06-ASSET", approvedBy: "finance-controller" };

test("builds the formal cutover provider options only from explicit config", () => {
  const options = buildClosingWorkbookCutoverOptions({
    ...approval,
    archiveRoot: "readable/current",
    cutoffDate: "2026-06-30",
    companies: {
      TEST: {
        companyName: "测试公司",
        sourceSystem: "T6",
        sourceLedger: "999",
        sourceDatabase: "UFDATA_999_2026",
        mappingMode: "recurring",
        mappingStartYear: 2026,
        selectors: [{ sourceKey: "9&10-3:3", role: "asset", sourceAccountCode: "1123", auxiliary: { supplierCode: "0024" } }],
      },
    },
  }, scope, "/controlled");
  assert.equal(options.archiveRoot, "/controlled/readable/current");
  assert.equal(options.spec.sourceLedger, "999");
  assert.deepEqual(options.selector?.({
    asset: { sourceKey: "9&10-3:3", originalCost: 1, workbookNetBookValue: 1, workbookAccumulatedAmount: 0, fullUsefulLifeMonths: 1, remainingUsefulLifeMonthsAtCutover: 1, cutoverResidualValue: 0, assetAccountId: 1, accumulatedAccountId: null, impairmentAllowanceAccountId: null },
    role: "asset",
    workspaceAccountCode: "1123",
  }), { sourceAccountCode: "1123", auxiliary: { supplierCode: "0024" }, allocationMode: "standard", approvalReason: undefined, approvedSelectedAmount: undefined });
});

test("fails closed when company ledger or explicit selectors config is missing", () => {
  assert.throws(() => buildClosingWorkbookCutoverOptions({ ...approval, archiveRoot: ".", cutoffDate: "2026-06-30", companies: {} }, scope), /缺少公司 TEST/);
  assert.throws(() => buildClosingWorkbookCutoverOptions({
    ...approval,
    archiveRoot: ".", cutoffDate: "2026-06-30", companies: { TEST: { companyName: "测试", sourceSystem: "T6", sourceLedger: "999", sourceDatabase: "UFDATA_999_2026", mappingMode: "recurring", mappingStartYear: 2026 } },
  }, scope), /selectors 数组/);
});

test("fails closed when the requested scope is not the approved 2026-06-30 cutover", () => {
  assert.throws(() => buildClosingWorkbookCutoverOptions({
    ...approval,
    archiveRoot: ".",
    cutoffDate: "2026-05-31",
    companies: {},
  }, { companyCode: "TEST", year: 2026, month: 5 }), /2026-06-30/);
});

test("rejects unknown, non-string, and empty auxiliary selectors at runtime", () => {
  const configured = (auxiliary: unknown) => ({
    ...approval,
    archiveRoot: ".",
    cutoffDate: "2026-06-30",
    companies: {
      TEST: {
        companyName: "测试",
        sourceSystem: "T6",
        sourceLedger: "999",
        sourceDatabase: "UFDATA_999_2026",
        mappingMode: "recurring",
        mappingStartYear: 2026,
        selectors: [{ sourceKey: "9&10-3:3", role: "asset", auxiliary }],
      },
    },
  });
  assert.throws(() => buildClosingWorkbookCutoverOptions(configured({ vendorCode: "0024" }), scope), /未知键：vendorCode/);
  assert.throws(() => buildClosingWorkbookCutoverOptions(configured({ supplierCode: 24 }), scope), /必须是非空字符串/);
  assert.throws(() => buildClosingWorkbookCutoverOptions(configured({}), scope), /不得为空对象/);
});

test("requires an explicit non-empty execute actor", () => {
  assert.equal(requireClosingWorkbookActor(" finance-importer "), "finance-importer");
  assert.throws(() => requireClosingWorkbookActor(undefined), /--actor=<username>/);
  assert.throws(() => requireClosingWorkbookActor("  "), /--actor=<username>/);
});

test("requires explicit approval metadata and binds a distinct execute actor", () => {
  assert.throws(() => buildClosingWorkbookCutoverOptions({ archiveRoot: ".", cutoffDate: "2026-06-30", companies: {} }, scope), /尚未显式批准/);
  const options = buildClosingWorkbookCutoverOptions({ ...approval, archiveRoot: ".", cutoffDate: "2026-06-30", companies: { TEST: { companyName: "测试", sourceSystem: "T6", sourceLedger: "999", sourceDatabase: "UFDATA_999_2026", mappingMode: "recurring", mappingStartYear: 2026, selectors: [] } } }, scope);
  assert.deepEqual(bindClosingWorkbookExecution(options, "asset-importer").executionApproval, {
    approvalReference: approval.approvalReference,
    approvedBy: approval.approvedBy,
    executedBy: "asset-importer",
  });
});

test("strictly validates exceptional allocation modes and their approval fields", () => {
  const configured = (selector: Record<string, unknown>) => ({
    ...approval,
    archiveRoot: ".",
    cutoffDate: "2026-06-30",
    companies: {
      TEST: {
        companyName: "测试",
        sourceSystem: "T6",
        sourceLedger: "999",
        sourceDatabase: "UFDATA_999_2026",
        mappingMode: "recurring",
        mappingStartYear: 2026,
        selectors: [{ sourceKey: "9&10-3:3", role: "asset", sourceAccountCode: "1123", ...selector }],
      },
    },
  });
  assert.throws(() => buildClosingWorkbookCutoverOptions(configured({ allocationMode: "replace_single_card_from_gl" }), scope), /approvalReason/);
  assert.throws(() => buildClosingWorkbookCutoverOptions(configured({ allocationMode: "replace_single_card_from_gl", approvalReason: "批准", approvedSelectedAmount: 1 }), scope), /不得提供 approvedSelectedAmount/);
  assert.throws(() => buildClosingWorkbookCutoverOptions(configured({ allocationMode: "approved_subledger_amount", approvalReason: "批准", approvedSelectedAmount: 1.001 }), scope), /两位小数/);
  assert.throws(() => buildClosingWorkbookCutoverOptions(configured({ allocationMode: "standard", approvalReason: "不应出现" }), scope), /不得包含审批覆盖字段/);
  assert.throws(() => buildClosingWorkbookCutoverOptions(configured({ unexpected: true }), scope), /未知键：unexpected/);
  const options = buildClosingWorkbookCutoverOptions(configured({ allocationMode: "approved_subledger_amount", approvalReason: " 证据缺口经批准承接 ", approvedSelectedAmount: 7200 }), scope);
  assert.deepEqual(options.selector?.({
    asset: { sourceKey: "9&10-3:3", originalCost: 1, workbookNetBookValue: 1, workbookAccumulatedAmount: 0, fullUsefulLifeMonths: 1, remainingUsefulLifeMonthsAtCutover: 1, cutoverResidualValue: 0, assetAccountId: 1, accumulatedAccountId: null, impairmentAllowanceAccountId: null },
    role: "asset",
    workspaceAccountCode: "1123",
  }), { sourceAccountCode: "1123", auxiliary: undefined, allocationMode: "approved_subledger_amount", approvalReason: "证据缺口经批准承接", approvedSelectedAmount: 7200 });
});

test("strictly parses the current-cutover synthetic renovation card without accepting sourceFile", () => {
  const synthetic = {
    sourceKey: "9&10-3:29",
    sourceSheet: "9&10-3",
    sourceRange: "9&10-3!A18:E29",
    name: "长期待摊费用-承租装修成本池",
    category: "LT-LEASEHOLD",
    assetKind: "long_term_deferred",
    originalCost: 4_925_155.66,
    closingNet: 82_085.69,
    fullUsefulLife: 60,
    approvalReason: "总账已证实并批准承接",
  };
  const configured = (legacySyntheticAssets: unknown) => ({
    ...approval,
    archiveRoot: ".",
    cutoffDate: "2026-06-30",
    companies: {
      TEST: {
        companyName: "测试",
        sourceSystem: "T6",
        sourceLedger: "999",
        sourceDatabase: "UFDATA_999_2026",
        mappingMode: "recurring",
        mappingStartYear: 2026,
        selectors: [],
        legacySyntheticAssets,
      },
    },
  });
  const options = buildClosingWorkbookCutoverOptions(configured([synthetic]), scope);
  assert.deepEqual(options.legacySyntheticAssets, [synthetic]);
  assert.throws(() => buildClosingWorkbookCutoverOptions(configured([{ ...synthetic, sourceFile: "other.xlsx" }]), scope), /未知键：sourceFile/);
  assert.throws(() => buildClosingWorkbookCutoverOptions(configured([{ ...synthetic, originalCost: 1.001 }]), scope), /两位小数/);
  assert.throws(() => buildClosingWorkbookCutoverOptions(configured([{ ...synthetic, category: "FA-BUILDING" }]), scope), /LT-LEASEHOLD/);
});
