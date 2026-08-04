import assert from "node:assert/strict";
import test from "node:test";

import type {
  TreasuryInterestWorkpaperDto,
  TreasuryInterestWorkpaperLineDto,
  TreasuryLoanDto,
  TreasuryWorkspaceDto,
} from "../../types/treasury";
import {
  buildTreasuryInterestExportCommand,
  treasuryInterestWorkbook,
} from "./export-route-commands";

test("treasury interest exports require the selected company and period", () => {
  const missingScope = buildTreasuryInterestExportCommand({});
  assert.equal(missingScope.ok, false);
  if (!missingScope.ok) assert.equal(missingScope.issue.field, "companyCode");
  assert.equal(buildTreasuryInterestExportCommand({ companyCode: "01", year: 2026, month: 7 }).ok, true);
});

const trace = {
  sourceKind: "manual",
  sourceReleaseId: null,
  sourceSha256: null,
  sourceFile: null,
  sourceSheet: null,
  sourceRow: null,
  sourceRange: null,
  sourceKey: null,
};

function line(overrides: Partial<TreasuryInterestWorkpaperLineDto> = {}): TreasuryInterestWorkpaperLineDto {
  return {
    ...trace,
    id: 11,
    lineNo: 1,
    accrualFrom: "2026-07-01",
    accrualThrough: "2026-07-31",
    principalBasis: 100000,
    annualRate: 0.036,
    dayCount: 30,
    sourceReportedInterestAmount: 300,
    calculatedAmount: 300,
    sourceDifference: 0,
    note: null,
    createdAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

function workpaper(overrides: Partial<TreasuryInterestWorkpaperDto> = {}): TreasuryInterestWorkpaperDto {
  return {
    ...trace,
    id: 1,
    version: 1,
    loanId: 1,
    periodId: 9,
    status: "prepared",
    calculationVersion: "treasury-v1",
    inputFingerprint: "fingerprint",
    dayCountConvention: "30_360",
    note: null,
    lines: [],
    voucherLinks: [],
    calculation: {
      calculatedAmount: 0,
      sourceReportedAmount: null,
      sourceDifference: null,
      voucherAmount: 0,
      voucherDifference: 0,
    },
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

const loan: TreasuryLoanDto = {
  ...trace,
  id: 1,
  version: 1,
  companyId: 1,
  companyCode: "01",
  lenderPartyId: 7,
  identityKey: "loan:01:1",
  loanNo: "LN-001",
  name: "流动资金借款",
  currencyCode: "CNY",
  contractPrincipalAmount: 1000000,
  principalBalance: 1000000,
  startOn: "2026-01-01",
  endOn: null,
  status: "active",
  note: null,
  rateTerms: [],
  principalEvents: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function workspace(interestWorkpapers: TreasuryInterestWorkpaperDto[]): TreasuryWorkspaceDto {
  return {
    scope: { companyCode: "01", year: 2026, month: 7, periodId: 9, isClosed: false },
    bankAccounts: [],
    bankReconciliations: [],
    loans: [loan],
    interestWorkpapers,
    blockers: [],
    evidenceRefs: [],
  };
}

test("interest workbook keeps line and total amounts as auditable formulas", () => {
  const first = workpaper({
    lines: [
      line(),
      line({
        id: 12,
        lineNo: 2,
        principalBasis: 50000,
        annualRate: 0.048,
        dayCount: 15,
        sourceReportedInterestAmount: null,
        calculatedAmount: 100,
        sourceDifference: null,
      }),
    ],
    calculation: {
      calculatedAmount: 400,
      sourceReportedAmount: 300,
      sourceDifference: 100,
      voucherAmount: 380,
      voucherDifference: 20,
    },
  });
  const second = workpaper({
    id: 2,
    status: "reconciled",
    dayCountConvention: "actual_365",
    lines: [line({ id: 13, principalBasis: 200000, annualRate: 0.03, dayCount: 31, sourceReportedInterestAmount: null, calculatedAmount: 509.59, sourceDifference: null })],
    calculation: {
      calculatedAmount: 509.59,
      sourceReportedAmount: null,
      sourceDifference: null,
      voucherAmount: 509.59,
      voucherDifference: 0,
    },
  });
  const workbook = treasuryInterestWorkbook(workspace([first, second]));
  assert.deepEqual(workbook.columns.map((column) => column.header), [
    "借款", "底稿状态", "计息口径", "行号", "计息开始", "计息结束", "计息天数", "年基准天数",
    "计息本金", "年利率", "计算利息", "来源利息", "来源差额", "凭证金额", "凭证差额",
  ]);
  assert.equal(workbook.rows.length, 5);

  const firstDetail = workbook.rows[0]!;
  assert.deepEqual(firstDetail.slice(0, 4), ["LN-001 · 流动资金借款", "已编制", "30 / 360", 1]);
  assert.deepEqual(firstDetail[6], 30);
  assert.deepEqual(firstDetail[7], 360);
  assert.deepEqual(firstDetail[10], { kind: "formula", formula: "ROUND(I2*J2*G2/H2,2)", cachedValue: 300 });
  assert.deepEqual(firstDetail[11], 300);
  assert.deepEqual(firstDetail[12], { kind: "formula", formula: "ROUND(K2-L2,2)", cachedValue: 0 });
  assert.deepEqual(firstDetail[13], "");
  assert.deepEqual(firstDetail[14], "");

  const noSourceDetail = workbook.rows[1]!;
  assert.deepEqual(noSourceDetail[10], { kind: "formula", formula: "ROUND(I3*J3*G3/H3,2)", cachedValue: 100 });
  assert.deepEqual(noSourceDetail[11], "");
  assert.deepEqual(noSourceDetail[12], "");

  const firstTotal = workbook.rows[2]!;
  assert.deepEqual(firstTotal[3], "合计");
  assert.deepEqual(firstTotal[10], { kind: "formula", formula: "ROUND(SUM(K2:K3),2)", cachedValue: 400 });
  assert.deepEqual(firstTotal[11], { kind: "formula", formula: "ROUND(SUM(L2:L3),2)", cachedValue: 300 });
  assert.deepEqual(firstTotal[12], { kind: "formula", formula: "ROUND(K4-L4,2)", cachedValue: 100 });
  assert.deepEqual(firstTotal[13], 380);
  assert.deepEqual(firstTotal[14], { kind: "formula", formula: "ROUND(K4-N4,2)", cachedValue: 20 });

  const secondDetail = workbook.rows[3]!;
  assert.deepEqual(secondDetail[1], "已核对");
  assert.deepEqual(secondDetail[2], "实际天数 / 365");
  assert.deepEqual(secondDetail[7], 365);
  assert.deepEqual(secondDetail[10], { kind: "formula", formula: "ROUND(I5*J5*G5/H5,2)", cachedValue: 509.59 });

  const secondTotal = workbook.rows[4]!;
  assert.deepEqual(secondTotal[10], { kind: "formula", formula: "ROUND(SUM(K5:K5),2)", cachedValue: 509.59 });
  assert.deepEqual(secondTotal[11], "");
  assert.deepEqual(secondTotal[12], "");
  assert.deepEqual(secondTotal[13], 509.59);
  assert.deepEqual(secondTotal[14], { kind: "formula", formula: "ROUND(K6-N6,2)", cachedValue: 0 });
});

test("interest workbook exports an empty sheet when the period has no workpapers", () => {
  const workbook = treasuryInterestWorkbook(workspace([]));
  assert.equal(workbook.rows.length, 0);
  assert.equal(workbook.sheetName, "利息底稿");
});
