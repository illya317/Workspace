import type {
  GroupVoucherBalanceCheck,
  GroupVoucherReclassificationTrace,
  GroupVoucherSourceTrace,
} from "@workspace/finance/types";
import { prisma } from "@workspace/platform/server/prisma";

interface GroupVoucherAuditLine {
  lineId: number;
  sourceAuxiliaryBalanceId: number | null;
}

interface AuxiliaryBalanceAuditFact {
  id: number;
  companyCode: string;
  periodId: number;
  accountId: number;
  openingDebit: unknown;
  openingCredit: unknown;
  closingDebit: unknown;
  closingCredit: unknown;
  period: { startDate: string; endDate: string };
  account: { code: string; name: string; balanceDirection: string };
  members: Array<{ memberId: number }>;
}

interface VoucherAuditFact {
  id: number;
  accountId: number;
  debit: number;
  credit: number;
  description: string | null;
  voucher: {
    voucherNo: string;
    date: string;
    companyCode: string;
  };
  account: { code: string; name: string };
  auxiliaryLinks: Array<{ memberId: number }>;
  reclassResults?: Array<{ targetAccount: string; status: string }>;
}

interface ReclassificationAuditFact {
  periodId: number;
  companyCode: string;
  sourceAccountCode: string;
  targetAccountCode: string | null;
  basis: string;
  sourceType: string;
  status: string;
  sourceGroupAccount: { code: string; name: string } | null;
  targetGroupAccount: { code: string; name: string } | null;
}

export interface GroupVoucherSourceAudit {
  sourceTrace: GroupVoucherSourceTrace[];
  sourceBalanceCheck: GroupVoucherBalanceCheck;
  sourceReclassification: GroupVoucherReclassificationTrace | null;
}

function money(value: unknown) {
  return Math.round(Number(value) * 100) / 100;
}

function traceAmount(input: {
  key: string;
  sourceType: GroupVoucherSourceTrace["sourceType"];
  sourceLabel: string;
  date: string | null;
  voucherNo?: string | null;
  accountCode: string;
  accountName: string;
  description?: string | null;
  debit: unknown;
  credit: unknown;
}): GroupVoucherSourceTrace {
  return {
    ...input,
    voucherNo: input.voucherNo ?? null,
    description: input.description ?? null,
    debit: money(input.debit),
    credit: money(input.credit),
  };
}

export function buildGroupVoucherSourceTrace(
  balance: AuxiliaryBalanceAuditFact,
  vouchers: readonly VoucherAuditFact[],
): GroupVoucherSourceTrace[] {
  const openingDebit = money(balance.openingDebit);
  const openingCredit = money(balance.openingCredit);
  const closingDebit = money(balance.closingDebit);
  const closingCredit = money(balance.closingCredit);
  const historicalVouchers = vouchers.filter((voucher) => voucher.voucher.date < balance.period.startDate);
  const currentVouchers = vouchers.filter((voucher) => voucher.voucher.date >= balance.period.startDate);
  const historicalVoucherNet = money(historicalVouchers.reduce((sum, voucher) => sum + voucher.debit - voucher.credit, 0));
  const currentVoucherNet = money(currentVouchers.reduce((sum, voucher) => sum + voucher.debit - voucher.credit, 0));
  const openingNet = money(openingDebit - openingCredit);
  const untracedOpeningNet = money(openingNet - historicalVoucherNet);
  const untracedNet = money((closingDebit - closingCredit) - openingNet - currentVoucherNet);
  const rows: GroupVoucherSourceTrace[] = [traceAmount({
    key: `balance-${balance.id}-opening`,
    sourceType: "openingBalance",
    sourceLabel: "期初余额（小计）",
    date: balance.period.startDate,
    accountCode: balance.account.code,
    accountName: balance.account.name,
    description: "辅助核算期初余额",
    debit: openingDebit,
    credit: openingCredit,
  })];
  rows.push(...historicalVouchers.map((voucher) => traceAmount({
    key: `historical-voucher-item-${voucher.id}`,
    sourceType: "historicalVoucher",
    sourceLabel: "期初关联凭证",
    date: voucher.voucher.date,
    voucherNo: voucher.voucher.voucherNo,
    accountCode: voucher.account.code,
    accountName: voucher.account.name,
    description: voucher.description,
    debit: voucher.debit,
    credit: voucher.credit,
  })).map((row, index) => ({
    ...row,
    reclassifiedToAccountCode: historicalVouchers[index]?.reclassResults?.[0]?.targetAccount ?? null,
    reclassificationStatus: historicalVouchers[index]?.reclassResults?.[0]?.status ?? null,
  })));
  if (Math.abs(untracedOpeningNet) >= 0.005) {
    rows.push(traceAmount({
      key: `balance-${balance.id}-untraced-opening`,
      sourceType: "untracedOpeningBalance",
      sourceLabel: "期初未穿透",
      date: null,
      accountCode: balance.account.code,
      accountName: balance.account.name,
      description: "期初余额扣除已关联历史凭证后的未穿透部分",
      debit: untracedOpeningNet > 0 ? untracedOpeningNet : 0,
      credit: untracedOpeningNet < 0 ? -untracedOpeningNet : 0,
    }));
  }
  rows.push(...currentVouchers.map((voucher) => traceAmount({
    key: `voucher-item-${voucher.id}`,
    sourceType: "voucher",
    sourceLabel: "本期原始凭证",
    date: voucher.voucher.date,
    voucherNo: voucher.voucher.voucherNo,
    accountCode: voucher.account.code,
    accountName: voucher.account.name,
    description: voucher.description,
    debit: voucher.debit,
    credit: voucher.credit,
  })).map((row, index) => ({
    ...row,
    reclassifiedToAccountCode: currentVouchers[index]?.reclassResults?.[0]?.targetAccount ?? null,
    reclassificationStatus: currentVouchers[index]?.reclassResults?.[0]?.status ?? null,
  })));
  if (Math.abs(untracedNet) >= 0.005) {
    rows.push(traceAmount({
      key: `balance-${balance.id}-untraced`,
      sourceType: "untracedMovement",
      sourceLabel: "本期未穿透",
      date: null,
      accountCode: balance.account.code,
      accountName: balance.account.name,
      description: "辅助余额本期发生额尚未匹配到原始凭证明细",
      debit: untracedNet > 0 ? untracedNet : 0,
      credit: untracedNet < 0 ? -untracedNet : 0,
    }));
  }
  rows.push(traceAmount({
    key: `balance-${balance.id}-closing`,
    sourceType: "closingBalance",
    sourceLabel: "期末余额（小计）",
    date: balance.period.endDate,
    accountCode: balance.account.code,
    accountName: balance.account.name,
    description: "辅助核算期末余额（抵销金额依据）",
    debit: closingDebit,
    credit: closingCredit,
  }));
  return rows;
}

function balanceCheck(
  balance: AuxiliaryBalanceAuditFact,
  trace: readonly GroupVoucherSourceTrace[],
): GroupVoucherBalanceCheck {
  const openingNet = money(balance.openingDebit) - money(balance.openingCredit);
  const closingNet = money(balance.closingDebit) - money(balance.closingCredit);
  const netByType = (sourceType: GroupVoucherSourceTrace["sourceType"]) => money(trace
    .filter((row) => row.sourceType === sourceType)
    .reduce((sum, row) => sum + row.debit - row.credit, 0));
  return {
    openingNet: money(openingNet),
    currentMovementNet: money(closingNet - openingNet),
    closingNet: money(closingNet),
    openingUntracedNet: netByType("untracedOpeningBalance"),
    currentUntracedNet: netByType("untracedMovement"),
  };
}

function reclassificationTrace(
  balance: AuxiliaryBalanceAuditFact,
  adjustment: ReclassificationAuditFact | undefined,
): GroupVoucherReclassificationTrace | null {
  const closingNet = money(balance.closingDebit) - money(balance.closingCredit);
  const closingSide = closingNet > 0 ? "debit" : closingNet < 0 ? "credit" : null;
  const abnormal = closingSide !== null
    && ["debit", "credit"].includes(balance.account.balanceDirection)
    && closingSide !== balance.account.balanceDirection;
  if (!abnormal || !adjustment?.targetAccountCode) return null;
  return {
    sourceAccountCode: adjustment.sourceGroupAccount?.code ?? balance.account.code,
    sourceAccountName: adjustment.sourceGroupAccount?.name ?? balance.account.name,
    targetAccountCode: adjustment.targetGroupAccount?.code ?? adjustment.targetAccountCode,
    targetAccountName: adjustment.targetGroupAccount?.name ?? adjustment.targetAccountCode,
    basis: adjustment.basis,
    sourceType: adjustment.sourceType,
    status: adjustment.status,
  };
}

export async function loadGroupVoucherSourceTraces(lines: readonly GroupVoucherAuditLine[]) {
  const balanceIds = [...new Set(lines.flatMap((line) => (
    line.sourceAuxiliaryBalanceId ? [line.sourceAuxiliaryBalanceId] : []
  )))];
  if (balanceIds.length === 0) return new Map<number, GroupVoucherSourceAudit>();
  const balances = await prisma.financeAuxiliaryBalance.findMany({
    where: { id: { in: balanceIds } },
    select: {
      id: true,
      companyCode: true,
      periodId: true,
      accountId: true,
      openingDebit: true,
      openingCredit: true,
      closingDebit: true,
      closingCredit: true,
      period: { select: { startDate: true, endDate: true } },
      account: { select: { code: true, name: true, balanceDirection: true } },
      members: { select: { memberId: true } },
    },
  });
  const memberIds = [...new Set(balances.flatMap((balance) => balance.members.map((member) => member.memberId)))];
  const companyCodes = [...new Set(balances.map((balance) => balance.companyCode))];
  const accountCodes = [...new Set(balances.map((balance) => balance.account.code))];
  const latestEndDate = balances.reduce((latest, balance) => (
    balance.period.endDate > latest ? balance.period.endDate : latest
  ), "");
  const reclassifications = await prisma.financeBalanceReclassAdjustment.findMany({
    where: {
      periodId: { in: [...new Set(balances.map((balance) => balance.periodId))] },
      sourceAccountCode: { in: accountCodes },
      decision: "reclassify",
      status: { in: ["approved", "adjusted"] },
    },
    select: {
      periodId: true,
      companyCode: true,
      sourceAccountCode: true,
      targetAccountCode: true,
      basis: true,
      sourceType: true,
      status: true,
      sourceGroupAccount: { select: { code: true, name: true } },
      targetGroupAccount: { select: { code: true, name: true } },
    },
  });
  const auditVouchers = memberIds.length === 0 ? [] : await prisma.financeVoucherItem.findMany({
    where: {
      account: { code: { in: accountCodes } },
      voucher: {
        companyCode: { in: companyCodes },
        date: { lte: latestEndDate },
        status: "posted",
        OR: [{ sourceInvalid: false }, { sourceInvalid: null }],
      },
      auxiliaryLinks: { some: { memberId: { in: memberIds } } },
    },
    select: {
      id: true,
      accountId: true,
      debit: true,
      credit: true,
      description: true,
      voucher: { select: { voucherNo: true, date: true, companyCode: true } },
      account: { select: { code: true, name: true } },
      auxiliaryLinks: { select: { memberId: true } },
      reclassResults: {
        where: { status: { in: ["approved", "adjusted"] } },
        select: { targetAccount: true, status: true },
        orderBy: { id: "desc" },
        take: 1,
      },
    },
    orderBy: [{ voucher: { date: "asc" } }, { voucherId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
  const balanceById = new Map(balances.map((balance) => [balance.id, balance]));
  const auditByBalanceId = new Map<number, GroupVoucherSourceAudit>();
  for (const balance of balances) {
    const memberIds = new Set(balance.members.map((member) => member.memberId));
    const vouchers = auditVouchers.filter((voucher) => (
      voucher.account.code === balance.account.code
      && voucher.voucher.companyCode === balance.companyCode
      && voucher.voucher.date <= balance.period.endDate
      && voucher.auxiliaryLinks.some((link) => memberIds.has(link.memberId))
    ));
    const trace = buildGroupVoucherSourceTrace(balance, vouchers);
    const reclassification = reclassifications.find((item) => (
      item.periodId === balance.periodId
      && item.companyCode === balance.companyCode
      && item.sourceAccountCode === balance.account.code
    ));
    auditByBalanceId.set(balance.id, {
      sourceTrace: trace,
      sourceBalanceCheck: balanceCheck(balance, trace),
      sourceReclassification: reclassificationTrace(balance, reclassification),
    });
  }
  return new Map(lines.flatMap((line) => {
    const balanceId = line.sourceAuxiliaryBalanceId;
    if (!balanceId || !balanceById.has(balanceId)) return [];
    const audit = auditByBalanceId.get(balanceId);
    return audit ? [[line.lineId, audit] as const] : [];
  }));
}
