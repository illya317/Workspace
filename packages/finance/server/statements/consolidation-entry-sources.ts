import { createHash } from "node:crypto";

import type { ConsolidationMatchSourceKind, StatementReportType } from "@workspace/finance/types";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { authorize } from "@workspace/platform/server/auth";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { matchesFkKeyword } from "@workspace/platform/server/relation-registry";

interface SourceContext {
  batchId: number;
  entitySnapshotId: number;
  sourceKind: ConsolidationMatchSourceKind;
  sourceRecordId: number;
  reportType: StatementReportType;
  lineCode: string;
  periodBasis: "current" | "comparative";
}

interface SourceAuditFact {
  sourceId: string;
  sourceFingerprint: string;
  sourceAmount: number;
  sourceCurrency: string;
  sourceSnapshotId: number | null;
  sourceAuxiliaryBalanceId: number | null;
  sourceOpenItemId: number | null;
  sourceCashFlowAllocationId: number | null;
  sourceVoucherItemId: number | null;
}

interface SourceCandidate extends SourceAuditFact {
  id: number;
  name: string;
  subtitle: string;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function positiveAmount(...values: Array<number | Prisma.Decimal | null | undefined>) {
  const amount = Math.max(...values.map((value) => Math.abs(Number(value ?? 0))));
  return Math.round(amount * 100) / 100;
}

function reportPayloadLines(reportType: StatementReportType, value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const envelope = value as Record<string, unknown>;
  const payloadValue = envelope.payload ?? envelope;
  if (!payloadValue || typeof payloadValue !== "object" || Array.isArray(payloadValue)) return [];
  const payload = payloadValue as Record<string, unknown>;
  const rows = reportType === "balanceSheet"
    ? [payload.assets, payload.liabilities, payload.equity].flatMap((part) => Array.isArray(part) ? part : [])
    : Array.isArray(payload.lines) ? payload.lines : [];
  return rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

function baseFact(kind: ConsolidationMatchSourceKind, id: number, amount: number, currency: string, auditValue: unknown): SourceAuditFact {
  return {
    sourceId: `${kind}:${id}`,
    sourceFingerprint: fingerprint(auditValue),
    sourceAmount: amount,
    sourceCurrency: currency,
    sourceSnapshotId: kind === "workpaper" ? id : null,
    sourceAuxiliaryBalanceId: kind === "auxiliaryBalance" ? id : null,
    sourceOpenItemId: kind === "openItem" ? id : null,
    sourceCashFlowAllocationId: kind === "cashFlowAllocation" ? id : null,
    sourceVoucherItemId: kind === "voucher" ? id : null,
  };
}

function periodYear(year: number, basis: "current" | "comparative") {
  return basis === "comparative" ? year - 1 : year;
}

async function loadSourceCandidate(context: SourceContext): Promise<SourceCandidate | null> {
  const batch = await prisma.financeConsolidationBatch.findUnique({
    where: { id: context.batchId },
    select: {
      year: true,
      month: true,
      entities: { where: { id: context.entitySnapshotId }, select: { id: true, companyCode: true, functionalCurrency: true } },
    },
  });
  const entity = batch?.entities[0];
  if (!batch || !entity) return null;
  const year = periodYear(batch.year, context.periodBasis);

  if (context.sourceKind === "workpaper") {
    const row = await prisma.financeConsolidationSourceSnapshot.findFirst({
      where: { id: context.sourceRecordId, batchId: context.batchId, entitySnapshotId: entity.id, reportType: context.reportType },
      select: { id: true, reportType: true, sourceKind: true, workpaperId: true, workpaperVersion: true, fingerprint: true, reportPayload: true },
    });
    const reportLine = row && reportPayloadLines(context.reportType, row.reportPayload).find((line) => line.lineCode === context.lineCode);
    if (!row || !reportLine) return null;
    const amount = positiveAmount(context.periodBasis === "comparative" ? Number(reportLine.previousAmount ?? 0) : Number(reportLine.amount ?? 0));
    const auditValue = { id: row.id, fingerprint: row.fingerprint, reportType: row.reportType, lineCode: context.lineCode, periodBasis: context.periodBasis, amount };
    return {
      id: row.id,
      name: `冻结底稿 · ${String(reportLine.label ?? context.lineCode)}`,
      subtitle: `${row.sourceKind} #${row.workpaperId ?? "系统"} v${row.workpaperVersion ?? 1} · ${amount.toFixed(2)} ${entity.functionalCurrency ?? "CNY"}`,
      ...baseFact("workpaper", row.id, amount, entity.functionalCurrency ?? "CNY", auditValue),
    };
  }

  if (context.sourceKind === "auxiliaryBalance") {
    const row = await prisma.financeAuxiliaryBalance.findFirst({
      where: { id: context.sourceRecordId, companyCode: entity.companyCode, period: { year, month: batch.month } },
      include: { account: { select: { code: true, name: true } }, members: { include: { member: { select: { sourceCode: true, sourceName: true } } } } },
    });
    if (!row) return null;
    const amount = positiveAmount(row.closingDebit, row.closingCredit);
    const members = row.members.map((link) => `${link.member.sourceCode} ${link.member.sourceName}`).join("、") || "无辅助维度";
    const auditValue = { id: row.id, sourceSystem: row.sourceSystem, sourceDatabase: row.sourceDatabase, sourceKey: row.sourceKey, amount, members };
    return { id: row.id, name: `${row.account.code} ${row.account.name} · ${members}`, subtitle: `${amount.toFixed(2)} CNY · ${row.sourceSystem}/${row.sourceDatabase}`, ...baseFact("auxiliaryBalance", row.id, amount, "CNY", auditValue) };
  }

  if (context.sourceKind === "openItem") {
    const row = await prisma.financeOpenItem.findFirst({
      where: { id: context.sourceRecordId, companyCode: entity.companyCode, period: { year, month: batch.month } },
      include: { account: { select: { code: true, name: true } }, members: { include: { member: { select: { sourceCode: true, sourceName: true } } } } },
    });
    if (!row) return null;
    const amount = positiveAmount(row.outstandingDebit, row.outstandingCredit);
    const currency = row.currencyCode || "CNY";
    const members = row.members.map((link) => `${link.member.sourceCode} ${link.member.sourceName}`).join("、") || "无往来对象";
    const auditValue = { id: row.id, sourceSystem: row.sourceSystem, sourceDatabase: row.sourceDatabase, sourceKey: row.sourceKey, amount, currency, status: row.status };
    return { id: row.id, name: `${row.documentNo || row.sourceKey} · ${members}`, subtitle: `${row.account?.code ?? "未挂科目"} · ${amount.toFixed(2)} ${currency}`, ...baseFact("openItem", row.id, amount, currency, auditValue) };
  }

  if (context.sourceKind === "cashFlowAllocation") {
    const row = await prisma.financeCashFlowAllocation.findFirst({
      where: { id: context.sourceRecordId, companyCode: entity.companyCode, period: { year, month: batch.month } },
      include: { voucher: { select: { voucherNo: true, date: true } }, cashFlowItem: { select: { sourceCode: true, sourceName: true } } },
    });
    if (!row) return null;
    const amount = positiveAmount(row.amount);
    const auditValue = { id: row.id, sourceSystem: row.sourceSystem, sourceDatabase: row.sourceDatabase, sourceKey: row.sourceKey, direction: row.direction, amount };
    return { id: row.id, name: `${row.voucher.voucherNo} · ${row.cashFlowItem.sourceName}`, subtitle: `${row.voucher.date} · ${row.direction} ${amount.toFixed(2)} CNY`, ...baseFact("cashFlowAllocation", row.id, amount, "CNY", auditValue) };
  }

  const row = await prisma.financeVoucherItem.findFirst({
    where: { id: context.sourceRecordId, voucher: { companyCode: entity.companyCode, period: { year, month: batch.month } } },
    include: { voucher: { select: { voucherNo: true, date: true } }, account: { select: { code: true, name: true } } },
  });
  if (!row) return null;
  const currency = row.currencyCode || "CNY";
  const originalAmount = positiveAmount(row.originalDebit, row.originalCredit);
  const amount = currency === "CNY" || originalAmount === 0 ? positiveAmount(row.debit, row.credit) : originalAmount;
  const auditValue = { id: row.id, importFingerprint: row.importFingerprint, sourceSystem: row.sourceSystem, sourceDatabase: row.sourceDatabase, sourceKey: row.sourceKey, amount, currency };
  return { id: row.id, name: `${row.voucher.voucherNo} · ${row.account.code} ${row.account.name}`, subtitle: `${row.voucher.date} · ${amount.toFixed(2)} ${currency}`, ...baseFact("voucher", row.id, amount, currency, auditValue) };
}

export async function resolveConsolidationEntrySource(context: SourceContext) {
  const candidate = await loadSourceCandidate(context);
  if (!candidate) throw new Error("选择的匹配来源不属于当前批次主体、期间或报表行");
  if (candidate.sourceAmount <= 0) throw new Error("选择的匹配来源金额必须大于 0");
  const { id: _id, name: _name, subtitle: _subtitle, ...fact } = candidate;
  return fact;
}

export async function listConsolidationEntrySourceOptions(command: {
  batchId: number;
  entitySnapshotId: number;
  sourceKind: ConsolidationMatchSourceKind;
  reportType: StatementReportType;
  lineCode: string;
  periodBasis: "current" | "comparative";
  keyword: string;
  userId: number;
}) {
  if (!(await authorize({ user: command.userId, resourceKey: "finance.statements", action: "read" }))) {
    return serviceError("无权限读取抵销来源", 403);
  }
  const batch = await prisma.financeConsolidationBatch.findUnique({
    where: { id: command.batchId },
    select: { year: true, month: true, entities: { where: { id: command.entitySnapshotId }, select: { companyCode: true } } },
  });
  const entity = batch?.entities[0];
  if (!batch || !entity) return serviceError("合并主体不属于当前批次", 404);
  const year = periodYear(batch.year, command.periodBasis);
  const ids = command.sourceKind === "workpaper"
    ? await prisma.financeConsolidationSourceSnapshot.findMany({ where: { batchId: command.batchId, entitySnapshotId: command.entitySnapshotId, reportType: command.reportType }, select: { id: true }, take: 100 })
    : command.sourceKind === "auxiliaryBalance"
      ? await prisma.financeAuxiliaryBalance.findMany({ where: { companyCode: entity.companyCode, period: { year, month: batch.month } }, select: { id: true }, take: 200, orderBy: { id: "desc" } })
      : command.sourceKind === "openItem"
        ? await prisma.financeOpenItem.findMany({ where: { companyCode: entity.companyCode, period: { year, month: batch.month } }, select: { id: true }, take: 200, orderBy: { id: "desc" } })
        : command.sourceKind === "cashFlowAllocation"
          ? await prisma.financeCashFlowAllocation.findMany({ where: { companyCode: entity.companyCode, period: { year, month: batch.month } }, select: { id: true }, take: 200, orderBy: { id: "desc" } })
          : await prisma.financeVoucherItem.findMany({ where: { voucher: { companyCode: entity.companyCode, period: { year, month: batch.month } } }, select: { id: true }, take: 200, orderBy: { id: "desc" } });
  const candidates = (await Promise.all(ids.map(({ id }) => loadSourceCandidate({ ...command, sourceRecordId: id })))).filter((item): item is SourceCandidate => Boolean(item));
  const items = candidates
    .filter((item) => matchesFkKeyword([item.name, item.subtitle, String(item.id)], command.keyword))
    .slice(0, 50)
    .map((item) => ({ id: item.id, name: item.name, subtitle: item.subtitle }));
  return serviceOk({ items });
}
