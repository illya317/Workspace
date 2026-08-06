import type {
  ConsolidatedEquityChangesRow,
  ConsolidatedEquityChangesStatement,
  ConsolidatedStatementOutput,
  ConsolidationEntrySnapshot,
  NciEquityMovement,
  NciEquityMovementType,
  NciEquityWorkpaper,
} from "@workspace/finance/types";

import type { ConsolidationReplayPackage } from "./consolidation-replay";
import { buildNciContinuityLedger, equityMoney as money } from "./consolidation-equity-continuity-ledger";

function lineAmount(line: { debit: number; credit: number }) {
  return money(line.credit - line.debit);
}

function movementType(
  entry: ConsolidationEntrySnapshot,
  sourceId: string | null | undefined,
): Exclude<NciEquityMovementType, "opening"> | null {
  const key = entry.generationKey ?? "";
  const source = sourceId ?? "";
  if (source.includes(":nci:opening:")) return null;
  if (source.includes(":nci:contribution")) return "contribution";
  if (source.includes(":nci:oci:")) return "otherComprehensiveIncome";
  if (source.includes(":nci:distribution:")) return "distribution";
  if (source.includes(":nci:ownership:")) return "ownershipChange";
  if (source.includes(":nci:other:")) return "otherAdjustment";
  if (/^policy:nci:.+:profit:\d{4}-\d{2}$/.test(key)) return "profitLoss";
  if (key.includes(":oci:")) return "otherComprehensiveIncome";
  if (key.includes(":contribution:")) return "contribution";
  if (key.includes(":distribution:")) return "distribution";
  if (key.includes(":ownership:")) return "ownershipChange";
  if (key.includes(":other:")) return "otherAdjustment";
  return null;
}

function movementLabel(type: NciEquityMovementType) {
  if (type === "opening") return "期初少数股东权益";
  if (type === "contribution") return "少数股东投入/初始确认";
  if (type === "profitLoss") return "少数股东应占净利润";
  if (type === "otherComprehensiveIncome") return "少数股东应占其他综合收益";
  if (type === "distribution") return "向少数股东分红";
  if (type === "ownershipChange") return "持股比例变化";
  return "其他有证据调整";
}

function reportLine(statement: ConsolidatedStatementOutput | undefined, lineCode: string) {
  return statement?.lines.find((line) => line.lineCode === lineCode);
}

function nciEntryMovements(replay: ConsolidationReplayPackage): NciEquityMovement[] {
  const entityById = new Map(replay.entities.map((entity) => [entity.id, entity]));
  return replay.approvedEntries.flatMap((entry): NciEquityMovement[] => {
    return entry.lines.filter((line) => (
      line.statementType === "balanceSheet"
      && line.periodBasis !== "comparative"
      && line.lineCode === "nonControllingInterests"
    )).flatMap((line) => {
      const type = movementType(entry, line.sourceId);
      if (!type) return [];
      const entity = entityById.get(line.entitySnapshotId);
      return [{
        key: `${entry.id}:${line.id}`,
        movementType: type,
        label: movementLabel(type),
        postingDate: entry.postingDate,
        amount: lineAmount(line),
        entitySnapshotId: line.entitySnapshotId,
        companyCode: entity?.companyCode ?? line.companyCode,
        companyName: entity?.companyName ?? null,
        entryId: entry.id,
        entryNo: entry.entryNo,
        evidence: entry.evidence,
      }];
    });
  });
}

function nciEntryOpening(replay: ConsolidationReplayPackage) {
  let found = false;
  const amount = money(replay.approvedEntries.reduce((entrySum, entry) => (
    entrySum + entry.lines.reduce((lineSum, line) => {
      const isOpening = line.statementType === "balanceSheet"
        && line.periodBasis !== "comparative"
        && line.lineCode === "nonControllingInterests"
        && (line.sourceId ?? "").includes(":nci:opening:");
      if (!isOpening) return lineSum;
      found = true;
      return lineSum + lineAmount(line);
    }, 0)
  ), 0));
  return { found, amount };
}

function sumMovements(movements: readonly NciEquityMovement[], type: NciEquityMovementType) {
  return money(movements.filter((movement) => movement.movementType === type)
    .reduce((sum, movement) => sum + movement.amount, 0));
}

function subsidiaryNetAssetsCrossCheck(
  replay: ConsolidationReplayPackage,
  balance: ConsolidatedStatementOutput | undefined,
) {
  const equity = reportLine(balance, "totalEquity");
  if (!equity?.entityAmounts) return 0;
  const entityById = new Map(replay.entities.map((entity) => [entity.id, entity]));
  return money(equity.entityAmounts.reduce((sum, amount) => {
    const entity = entityById.get(amount.entitySnapshotId);
    if (!entity || entity.role !== "subsidiary" || entity.shareRatio === null
      || entity.shareRatio <= 0 || entity.shareRatio >= 1) return sum;
    return sum + amount.amount * (1 - entity.shareRatio);
  }, 0));
}

function subsidiaryOpeningNetAssets(
  replay: ConsolidationReplayPackage,
  balance: ConsolidatedStatementOutput | undefined,
) {
  const equity = reportLine(balance, "totalEquity");
  if (!equity?.entityAmounts) return 0;
  const entityById = new Map(replay.entities.map((entity) => [entity.id, entity]));
  return money(equity.entityAmounts.reduce((sum, amount) => {
    const entity = entityById.get(amount.entitySnapshotId);
    if (!entity || entity.role !== "subsidiary" || entity.shareRatio === null
      || entity.shareRatio <= 0 || entity.shareRatio >= 1) return sum;
    return sum + amount.previousAmount * (1 - entity.shareRatio);
  }, 0));
}

export function buildNciEquityWorkpaper(
  replay: ConsolidationReplayPackage,
  statements: readonly ConsolidatedStatementOutput[],
): NciEquityWorkpaper {
  const balance = statements.find((statement) => statement.reportType === "balanceSheet");
  const income = statements.find((statement) => statement.reportType === "incomeStatement");
  const nciBalance = reportLine(balance, "nonControllingInterests");
  const hasLockedYearOpening = Boolean(replay.priorReferences?.yearOpening?.groupStatements?.balanceSheet
    ?.some((line) => line.lineCode === "nonControllingInterests"));
  const entryOpening = nciEntryOpening(replay);
  const openingBalance = hasLockedYearOpening
    ? money(nciBalance?.previousAmount ?? 0)
    : entryOpening.found
      ? entryOpening.amount
      : subsidiaryOpeningNetAssets(replay, balance);
  const reportedClosingBalance = money(nciBalance?.amount ?? 0);
  const movements: NciEquityMovement[] = [{
    key: "opening",
    movementType: "opening",
    label: movementLabel("opening"),
    postingDate: null,
    amount: openingBalance,
    entitySnapshotId: null,
    companyCode: null,
    companyName: null,
    entryId: null,
    entryNo: null,
    evidence: hasLockedYearOpening
      ? "上期已锁定合并资产负债表少数股东权益期末数"
      : entryOpening.found
        ? "首次并表切换期初凭证：按权益组成逐项确认少数股东权益"
        : "首次并表切换日前一日：折算后单体权益组成逐项乘有效少数股东比例",
  }, ...nciEntryMovements(replay)];
  const entryProfit = sumMovements(movements, "profitLoss");
  const reportedProfit = money(reportLine(income, "netProfitAttributableToNci")?.amount ?? 0);
  if (entryProfit === 0 && reportedProfit !== 0) {
    movements.push({
      key: "legacy-profit-attribution",
      movementType: "profitLoss",
      label: movementLabel("profitLoss"),
      postingDate: null,
      amount: reportedProfit,
      entitySnapshotId: null,
      companyCode: null,
      companyName: null,
      entryId: null,
      entryNo: null,
      evidence: "利润表已有少数股东损益，但缺少资产负债表少数股东权益联动凭证",
    });
  }
  const contributions = sumMovements(movements, "contribution");
  const profitLoss = sumMovements(movements, "profitLoss");
  const otherComprehensiveIncome = sumMovements(movements, "otherComprehensiveIncome");
  const distributions = sumMovements(movements, "distribution");
  const ownershipChanges = sumMovements(movements, "ownershipChange");
  const otherAdjustments = sumMovements(movements, "otherAdjustment");
  const netAssetsCrossCheck = subsidiaryNetAssetsCrossCheck(replay, balance);
  const { calculatedClosingBalance, rollforwardDifference, crossCheckDifference } = buildNciContinuityLedger({
    openingBalance,
    movements: movements.filter((movement) => movement.movementType !== "opening"),
    reportedClosingBalance,
    netAssetsCrossCheck,
  });
  return {
    openingBalance,
    contributions,
    profitLoss,
    otherComprehensiveIncome,
    distributions,
    ownershipChanges,
    otherAdjustments,
    calculatedClosingBalance,
    reportedClosingBalance,
    rollforwardDifference,
    netAssetsCrossCheck,
    crossCheckDifference,
    status: Math.abs(rollforwardDifference) < 0.005 ? "reconciled" : "difference",
    crossCheckStatus: Math.abs(crossCheckDifference) < 0.005 ? "reconciled" : "difference",
    movements,
  };
}

const EQUITY_CODES = [
  "paidInCapital",
  "otherEquityInstruments",
  "capitalReserve",
  "treasuryStock",
  "otherComprehensiveIncome",
  "surplusReserve",
  "undistributedProfit",
] as const;

type EquityCode = typeof EQUITY_CODES[number];

function equityValues(balance: ConsolidatedStatementOutput | undefined, period: "current" | "previous") {
  return Object.fromEntries(EQUITY_CODES.map((code) => {
    const line = reportLine(balance, code);
    return [code, money(period === "current" ? line?.amount ?? 0 : line?.previousAmount ?? 0)];
  })) as Record<EquityCode, number>;
}

function equityRow(
  key: ConsolidatedEquityChangesRow["key"],
  label: string,
  values: Partial<Record<EquityCode, number>>,
  nci: number,
): ConsolidatedEquityChangesRow {
  const paidInCapital = money(values.paidInCapital ?? 0);
  const otherEquityInstruments = money(values.otherEquityInstruments ?? 0);
  const capitalReserve = money(values.capitalReserve ?? 0);
  const treasuryStock = money(values.treasuryStock ?? 0);
  const otherComprehensiveIncome = money(values.otherComprehensiveIncome ?? 0);
  const surplusReserve = money(values.surplusReserve ?? 0);
  const undistributedProfit = money(values.undistributedProfit ?? 0);
  const attributableToParent = money(
    paidInCapital + otherEquityInstruments + capitalReserve - treasuryStock
      + otherComprehensiveIncome + surplusReserve + undistributedProfit,
  );
  return {
    key,
    label,
    paidInCapital,
    otherEquityInstruments,
    capitalReserve,
    treasuryStock,
    otherComprehensiveIncome,
    surplusReserve,
    undistributedProfit,
    attributableToParent,
    nonControllingInterests: money(nci),
    totalEquity: money(attributableToParent + nci),
  };
}

export function buildConsolidatedEquityChanges(
  statements: readonly ConsolidatedStatementOutput[],
  nci: NciEquityWorkpaper,
): ConsolidatedEquityChangesStatement {
  const balance = statements.find((statement) => statement.reportType === "balanceSheet");
  const income = statements.find((statement) => statement.reportType === "incomeStatement");
  const opening = equityValues(balance, "previous");
  const closing = equityValues(balance, "current");
  const parentProfit = money(reportLine(income, "netProfitAttributableToParent")?.amount
    ?? reportLine(income, "netProfit")?.amount ?? 0);
  const profit = equityRow("profitLoss", "本期综合收益—净利润", { undistributedProfit: parentProfit }, nci.profitLoss);
  const ociMovement = money(closing.otherComprehensiveIncome - opening.otherComprehensiveIncome);
  const oci = equityRow(
    "otherComprehensiveIncome",
    "本期综合收益—其他综合收益",
    { otherComprehensiveIncome: ociMovement },
    nci.otherComprehensiveIncome,
  );
  const rows: ConsolidatedEquityChangesRow[] = [
    equityRow("opening", "一、上年年末余额", opening, nci.openingBalance),
    profit,
    oci,
    equityRow("ownerTransactions", "二、所有者投入、利润分配及其他所有者交易", {}, money(nci.contributions + nci.distributions)),
    equityRow("ownershipChanges", "三、持股比例变化", {}, nci.ownershipChanges),
    equityRow("otherAdjustments", "四、其他有证据调整", {}, nci.otherAdjustments),
    equityRow("closing", "五、本年年末余额", closing, nci.reportedClosingBalance),
  ];
  const knownClosing = money(rows.slice(0, -1).reduce((sum, row) => sum + row.totalEquity, 0));
  const reconciliationDifference = money(rows.at(-1)!.totalEquity - knownClosing);
  return {
    label: "合并所有者权益变动表",
    rows,
    reconciliationDifference,
    status: Math.abs(reconciliationDifference) < 0.005 && nci.status === "reconciled"
      ? "reconciled"
      : "difference",
  };
}
