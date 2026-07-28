import { matchText } from "@workspace/core/search";
import type { FinanceGroupVoucherDocumentType } from "@workspace/finance/types";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import {
  buildFinanceIdCommand,
  buildVoucherUpdateCommand,
  buildVoucherWriteCommand,
} from "../domain/finance-validation";
import { consolidationEntryReviewBlockReason } from "../domain/consolidation-entry-validation";
import {
  groupVoucherAccountName,
  groupVoucherCompanySummary,
  groupVoucherOccurrenceDate,
} from "./group-voucher-presentation";

interface VoucherItemInput {
  accountId: unknown;
  debit: unknown;
  credit: unknown;
  description?: unknown;
}

export interface ListVouchersInput {
  periodId?: number;
  status?: string;
  companyCode?: string;
  year?: number;
  month?: number;
  keyword?: string;
  page: number;
  pageSize: number;
  voucherKind?: "standard" | "group";
  documentType?: FinanceGroupVoucherDocumentType;
  origin?: "manual" | "system";
}

const voucherListInclude = {
  items: { include: { account: true }, orderBy: { sortOrder: "asc" as const } },
  period: true,
  cashFlowAllocations: {
    orderBy: { id: "asc" as const },
    select: {
      id: true,
      ownerVoucherItemId: true,
      counterpartItemId: true,
      direction: true,
      amount: true,
      cashFlowItem: { select: { sourceCode: true, sourceName: true } },
    },
  },
} satisfies Prisma.FinanceVoucherInclude;

const voucherChronologicalOrder = [
  { date: "desc" as const },
  { voucherNo: "desc" as const },
  { id: "desc" as const },
] satisfies Prisma.FinanceVoucherOrderByWithRelationInput[];

type VoucherListRow = Prisma.FinanceVoucherGetPayload<{ include: typeof voucherListInclude }>;

function voucherMatchingLabel(sourceMetadata: Prisma.JsonValue | null) {
  if (!sourceMetadata || typeof sourceMetadata !== "object" || Array.isArray(sourceMetadata)) return null;
  const evidence = sourceMetadata.evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  const matching = evidence.matching;
  if (!matching || typeof matching !== "object" || Array.isArray(matching)) return null;
  return typeof matching.label === "string" && matching.label.trim() ? matching.label.trim() : null;
}

function toVoucherListDto(voucher: VoucherListRow) {
  return {
    ...voucher,
    matchingLabel: voucherMatchingLabel(voucher.sourceMetadata),
    cashFlowAllocations: voucher.cashFlowAllocations.map((allocation) => ({
      ...allocation,
      amount: Number(allocation.amount),
    })),
  };
}

export type StandardVoucherListRow = ReturnType<typeof toVoucherListDto>;

export type GroupVoucherListRow = Awaited<ReturnType<typeof listGroupJournals>>["data"][number];

export interface VoucherListResult {
  data: Array<StandardVoucherListRow | GroupVoucherListRow>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  vouchers: Array<StandardVoucherListRow | GroupVoucherListRow>;
}

function calculateVoucherTotals(items: VoucherItemInput[]) {
  return {
    totalDebit: items.reduce((s: number, i) => s + (parseFloat(String(i.debit)) || 0), 0),
    totalCredit: items.reduce((s: number, i) => s + (parseFloat(String(i.credit)) || 0), 0),
  };
}

function toVoucherItemCreateInput(items: VoucherItemInput[]) {
  return items.map((item, idx) => ({
    accountId: parseInt(String(item.accountId)),
    debit: parseFloat(String(item.debit)) || 0,
    credit: parseFloat(String(item.credit)) || 0,
    description: String(item.description || ""),
    sortOrder: idx,
  }));
}

function validateBalancedVoucher(items: VoucherItemInput[]) {
  const totals = calculateVoucherTotals(items);
  if (Math.abs(totals.totalDebit - totals.totalCredit) > 0.001) {
    return { error: "借贷不平衡", status: 400 };
  }
  return totals;
}

export function listVouchers(
  input: ListVouchersInput & { voucherKind: "group" },
): ReturnType<typeof listGroupJournals>;
export function listVouchers(
  input: ListVouchersInput & { voucherKind?: "standard" },
): ReturnType<typeof listStandardVouchers>;
export function listVouchers(
  input: ListVouchersInput,
): Promise<VoucherListResult>;
export function listVouchers(input: ListVouchersInput): Promise<VoucherListResult> {
  if (input.voucherKind === "group") return listGroupJournals(input);
  return listStandardVouchers(input);
}

async function listStandardVouchers(input: ListVouchersInput) {
  const where: Prisma.FinanceVoucherWhereInput = {};
  if (input.periodId) where.periodId = input.periodId;
  if (input.status) where.status = input.status;
  if (input.companyCode) where.companyCode = input.companyCode;
  if (input.year !== undefined || input.month !== undefined) {
    where.period = {};
    if (input.year !== undefined) where.period.year = input.year;
    if (input.month !== undefined) where.period.month = input.month;
  }

  const skip = (input.page - 1) * input.pageSize;
  if (input.keyword) {
    const all = await prisma.financeVoucher.findMany({
      where,
      orderBy: voucherChronologicalOrder,
      include: voucherListInclude,
    });
    const filtered = all.filter(
      (voucher) =>
        matchText(voucher.voucherNo, input.keyword || "") ||
        matchText(voucher.description || "", input.keyword || ""),
    );
    const vouchers = filtered.slice(skip, skip + input.pageSize).map(toVoucherListDto);
    const total = filtered.length;
    return {
      data: vouchers,
      total,
      page: input.page,
      pageSize: input.pageSize,
      totalPages: Math.ceil(total / input.pageSize),
      vouchers,
    };
  }

  const [rows, total] = await Promise.all([
    prisma.financeVoucher.findMany({
      where,
      orderBy: voucherChronologicalOrder,
      skip,
      take: input.pageSize,
      include: voucherListInclude,
    }),
    prisma.financeVoucher.count({ where }),
  ]);
  const vouchers = rows.map(toVoucherListDto);

  return {
    data: vouchers,
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
    vouchers,
  };
}

async function listGroupJournals(input: ListVouchersInput) {
  const where: Prisma.FinanceConsolidationEntryWhereInput = {};
  if (input.status) where.status = input.status;
  if (input.documentType) where.documentType = input.documentType;
  if (input.origin) where.origin = input.origin;
  if (input.companyCode) where.lines = { some: { companyCode: input.companyCode } };
  if (input.year !== undefined || input.month !== undefined) {
    where.batch = {
      ...(input.year !== undefined ? { year: input.year } : {}),
      ...(input.month !== undefined ? { month: input.month } : {}),
    };
  }
  if (input.keyword) {
    where.OR = [
      { entryNo: { contains: input.keyword, mode: "insensitive" } },
      { title: { contains: input.keyword, mode: "insensitive" } },
      { description: { contains: input.keyword, mode: "insensitive" } },
      { evidence: { contains: input.keyword, mode: "insensitive" } },
    ];
  }
  const skip = (input.page - 1) * input.pageSize;
  const [rows, total] = await Promise.all([
    prisma.financeConsolidationEntry.findMany({
      where,
      orderBy: [{ postingDate: "desc" }, { entryNo: "desc" }, { id: "desc" }],
      skip,
      take: input.pageSize,
      include: {
        batch: { select: { id: true, year: true, month: true, revision: true } },
        lines: {
          orderBy: { lineNo: "asc" },
          include: {
            entity: { select: { companyId: true, companyCode: true, companyName: true } },
            counterpartyEntity: { select: { companyId: true, companyCode: true, companyName: true } },
            groupAccount: { select: { id: true, code: true, name: true } },
            sourceVoucherItem: { select: { voucher: { select: { date: true } } } },
            sourceAuxiliaryBalance: { select: { period: { select: { endDate: true } } } },
            sourceOpenItem: {
              select: {
                documentDate: true,
                period: { select: { endDate: true } },
                voucherItem: { select: { voucher: { select: { date: true } } } },
              },
            },
            sourceCashFlowAllocation: { select: { voucher: { select: { date: true } } } },
          },
        },
      },
    }),
    prisma.financeConsolidationEntry.count({ where }),
  ]);
  const companyIds = [...new Set(rows.flatMap((row) => row.lines.flatMap((line) => [
    line.entity.companyId,
    line.counterpartyEntity?.companyId,
    line.counterpartyCompanyId,
  ])).filter((companyId): companyId is number => Boolean(companyId)))];
  const companies = companyIds.length
    ? await prisma.company.findMany({
        where: { id: { in: companyIds } },
        select: {
          id: true,
          code: true,
          sortOrder: true,
          party: { select: { name: true, fullName: true } },
        },
      })
    : [];
  const companyById = new Map(companies.map((company) => [company.id, {
    companyCode: company.code,
    companyName: company.party.name || company.party.fullName,
    sortOrder: company.sortOrder,
  }]));
  const vouchers = rows.map((entry) => {
    const items = entry.lines.map((line) => {
      const entityName = companyById.get(line.entity.companyId)?.companyName ?? line.entity.companyName;
      const counterpartyName = line.counterpartyEntity
        ? companyById.get(line.counterpartyEntity.companyId)?.companyName ?? line.counterpartyEntity.companyName
        : line.counterpartyCompanyId
          ? companyById.get(line.counterpartyCompanyId)?.companyName ?? null
          : null;
      return {
        id: line.id,
        accountId: line.groupAccountId ?? 0,
        account: {
          id: line.groupAccount?.id ?? 0,
          code: line.groupAccount?.code || line.accountCode || line.lineCode,
          name: line.groupAccount?.name || groupVoucherAccountName(line.lineCode),
        },
        debit: Number(line.debit),
        credit: Number(line.credit),
        description: line.note || entry.title,
        sortOrder: line.lineNo,
        relatedEntity: counterpartyName,
        entityName,
        counterpartyName,
        sourceEvidence: line.sourceKind
          ? `${line.sourceKind}${line.sourceId ? ` · ${line.sourceId}` : ""}`
          : entry.evidence,
        entitySnapshotId: line.entitySnapshotId,
        statementType: line.statementType as "balanceSheet" | "incomeStatement" | "cashFlow",
        lineCode: line.lineCode,
        accountCode: line.accountCode,
        groupAccountId: line.groupAccountId,
        currencyCode: line.currencyCode,
        periodBasis: line.periodBasis as "current" | "comparative",
        note: line.note,
        matchSide: line.matchSide as "left" | "right" | null,
        sourceKind: line.sourceKind as "auxiliaryBalance" | "openItem" | "cashFlowAllocation" | "workpaper" | "voucher" | null,
        sourceRecordId: line.sourceAuxiliaryBalanceId
          ?? line.sourceOpenItemId
          ?? line.sourceCashFlowAllocationId
          ?? line.sourceSnapshotId
          ?? line.sourceVoucherItemId
          ?? null,
        sourceDate: groupVoucherOccurrenceDate({
          voucherDate: line.sourceVoucherItem?.voucher.date,
          auxiliaryBalancePeriodEnd: line.sourceAuxiliaryBalance?.period.endDate,
          openItemVoucherDate: line.sourceOpenItem?.voucherItem?.voucher.date,
          openItemDocumentDate: line.sourceOpenItem?.documentDate,
          openItemPeriodEnd: line.sourceOpenItem?.period?.endDate,
          cashFlowVoucherDate: line.sourceCashFlowAllocation?.voucher.date,
          postingDate: entry.postingDate,
        }),
        counterpartyEntitySnapshotId: line.counterpartyEntitySnapshotId,
        counterpartyCompanyId: line.counterpartyCompanyId,
      };
    });
    return {
      id: entry.id,
      voucherNo: entry.entryNo,
      date: entry.postingDate,
      periodId: 0,
      period: { id: 0, year: Number(entry.postingDate.slice(0, 4)), month: Number(entry.postingDate.slice(5, 7)) },
      description: groupVoucherCompanySummary(entry.lines.flatMap((line) => {
        const entity = companyById.get(line.entity.companyId);
        const counterpartyCompanyId = line.counterpartyEntity?.companyId ?? line.counterpartyCompanyId;
        const counterparty = counterpartyCompanyId ? companyById.get(counterpartyCompanyId) : null;
        return [
          {
            companyId: line.entity.companyId,
            companyCode: entity?.companyCode ?? line.entity.companyCode,
            companyName: entity?.companyName ?? line.entity.companyName,
            sortOrder: entity?.sortOrder ?? Number.MAX_SAFE_INTEGER,
          },
          ...(counterpartyCompanyId ? [{
            companyId: counterpartyCompanyId,
            companyCode: counterparty?.companyCode ?? line.counterpartyEntity?.companyCode ?? "",
            companyName: counterparty?.companyName ?? line.counterpartyEntity?.companyName ?? null,
            sortOrder: counterparty?.sortOrder ?? Number.MAX_SAFE_INTEGER,
          }] : []),
        ];
      })),
      totalDebit: entry.lines.reduce((sum, line) => sum + Number(line.debit), 0),
      totalCredit: entry.lines.reduce((sum, line) => sum + Number(line.credit), 0),
      status: entry.status,
      companyCode: null,
      voucherKind: "group" as const,
      documentType: entry.documentType as FinanceGroupVoucherDocumentType,
      postingLevel: entry.postingLevel as "10" | "20" | "30",
      origin: entry.origin as "manual" | "system",
      entryType: entry.entryType,
      title: entry.title,
      entryDescription: entry.description,
      evidence: entry.evidence,
      batchId: entry.batch.id,
      batchRevision: entry.batch.revision,
      reviewBlockReason: consolidationEntryReviewBlockReason({
        entryOrigin: entry.origin,
        evidence: entry.evidence,
      }),
      cashFlowAllocations: [],
      items,
    };
  });
  return {
    data: vouchers,
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
    vouchers,
  };
}

export async function createVoucher(body: Record<string, unknown>, editorId: number) {
  const command = buildVoucherWriteCommand(body, editorId);
  if (!command.ok) throw new Error(command.issue.message);
  const voucherNo = command.data.body.voucherNo as string;
  const date = command.data.body.date as string;
  const description = command.data.body.description as string | undefined;
  const companyCode = command.data.body.companyCode as string | undefined;
  const items = command.data.body.items as VoucherItemInput[] | undefined;
  const status = command.data.body.status as string | undefined;

  if (!voucherNo || !date || !items?.length) {
    return { error: "凭证号、日期、分录为必填", status: 400 };
  }
  if (!companyCode) {
    return { error: "公司编码为必填", status: 400 };
  }

  const totals = validateBalancedVoucher(items);
  if ("error" in totals) {
    return totals;
  }

  const dateObj = new Date(date);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;
  const period = await prisma.financePeriod.findFirst({
    where: { year, month, companyCode },
  });
  if (!period) {
    return {
      error: `未找到 ${year}年${month}月 的会计期间，请先创建期间`,
      periodNeeded: { year, month },
      status: 400,
    };
  }

  const existing = await prisma.financeVoucher.findFirst({
    where: { voucherNo, companyCode, periodId: period.id },
  });
  if (existing) {
    return { error: "凭证号已存在", status: 400 };
  }

  const voucher = await prisma.financeVoucher.create({
    data: {
      voucherNo,
      date,
      periodId: period.id,
      description: description || "",
      totalDebit: totals.totalDebit,
      totalCredit: totals.totalCredit,
      status: status || "draft",
      companyCode,
      editedBy: command.data.editorId,
      items: {
        create: toVoucherItemCreateInput(items),
      },
    },
    include: { items: { include: { account: true } }, period: true },
  });

  return { success: true, voucher };
}

export async function updateVoucher(
  voucherId: number,
  body: Record<string, unknown>,
  editorId: number,
) {
  const command = buildVoucherUpdateCommand(voucherId, body, editorId);
  if (!command.ok) throw new Error(command.issue.message);
  const date = command.data.body.date as string | undefined;
  const description = command.data.body.description as string | undefined;
  const status = command.data.body.status as string | undefined;
  const items = command.data.body.items as VoucherItemInput[] | undefined;

  const voucher = await prisma.financeVoucher.findUnique({
    where: { id: command.data.voucherId },
    include: { items: true },
  });
  if (!voucher) {
    return { error: "凭证不存在", status: 404 };
  }
  if (voucher.status === "posted" && !status) {
    return { error: "已过账凭证不能直接修改，请先反过账", status: 400 };
  }

  const updateData: Record<string, unknown> = {
    editedBy: command.data.editorId,
    editedAt: new Date(),
    version: { increment: 1 },
  };
  if (date && date !== voucher.date) {
    updateData.date = date;
    const dateObj = new Date(date);
    const period = await prisma.financePeriod.findFirst({
      where: {
        year: dateObj.getFullYear(),
        month: dateObj.getMonth() + 1,
        companyCode: voucher.companyCode,
      },
    });
    if (period) updateData.periodId = period.id;
  }
  if (description !== undefined) updateData.description = description;
  if (status) updateData.status = status;

  if (items && items.length > 0) {
    const totals = validateBalancedVoucher(items);
    if ("error" in totals) {
      return totals;
    }
    updateData.totalDebit = totals.totalDebit;
    updateData.totalCredit = totals.totalCredit;

    await prisma.financeVoucherItem.deleteMany({ where: { voucherId: command.data.voucherId } });
    updateData.items = { create: toVoucherItemCreateInput(items) };
  }

  const updated = await prisma.financeVoucher.update({
    where: { id: command.data.voucherId },
    data: updateData as unknown as Prisma.FinanceVoucherUpdateInput,
    include: { items: { include: { account: true } }, period: true },
  });

  return { success: true, voucher: updated };
}

export async function deleteVoucher(voucherId: number, userId: number) {
  const command = buildFinanceIdCommand(voucherId, "voucherId");
  if (!command.ok) throw new Error(command.issue.message);
  const result = await guardedDelete({
    entityType: "FinanceVoucher",
    modelKey: "financeVoucher",
    id: command.data.id,
    userId,
    actionLabel: "删除会计凭证",
    deleteMode: "hard",
    references: [
      { label: "凭证明细", count: (tx) => tx.financeVoucherItem.count({ where: { voucherId: command.data.id } }), policy: "cascade", cleanup: (tx) => tx.financeVoucherItem.deleteMany({ where: { voucherId: command.data.id } }).then(() => undefined) },
      { label: "现金流分配", count: (tx) => tx.financeCashFlowAllocation.count({ where: { voucherId: command.data.id } }) },
      { label: "资产期间分录", count: (tx) => tx.financeAssetPeriodEntry.count({ where: { voucherId: command.data.id } }) },
      { label: "资产调整", count: (tx) => tx.financeAssetAdjustment.count({ where: { voucherId: command.data.id } }) },
    ],
    referencePolicy: "checked",
  });
  return result.ok
    ? { success: true as const }
    : { success: false as const, error: result.error, status: result.status || 400 };
}
