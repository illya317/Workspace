/**
 * Phase 6b: 重分类审核操作 (approve / reject / adjust)
 */

import { prisma } from "@/lib/prisma";
import type { ReviewReclassParams, ReclassResultRow } from "./types";
import { syncReclassRuleResults } from "../reclass-rules/sync";

export async function reviewReclassResult(
  params: ReviewReclassParams,
): Promise<ReclassResultRow> {
  const { id, payload, userId } = params;

  // 1. 查记录 + period scope
  const record = await prisma.reclassResult.findUnique({
    where: { id },
    include: {
      period: { select: { companyCode: true, year: true } },
      voucherItem: {
        select: {
          relatedEntity: true,
          description: true,
          voucher: { select: { voucherNo: true, date: true } },
        },
      },
      rule: { select: { abnormalSide: true } },
      reviewer: { select: { name: true } },
    },
  });

  if (!record) throw new ReviewError("NOT_FOUND", "记录不存在");
  if (record.status !== "pending" && payload.action !== "revert" && payload.action !== "mark_pending")
    throw new ReviewError("NOT_PENDING", "只能审核待处理状态的记录");

  // 2. 按 action 处理
  const now = new Date();
  const note = "note" in payload ? (payload.note ?? null) : null;

  let updateData: {
    status: string;
    targetAccount?: string;
    amount?: number;
    note: string | null;
    adjustedBy: number;
    adjustedAt: Date;
  };

  switch (payload.action) {
    case "approve":
      updateData = { status: "approved", note, adjustedBy: userId, adjustedAt: now };
      break;

    case "adjust": {
      if (!payload.targetAccount || payload.amount <= 0) {
        throw new ReviewError("INVALID_ADJUST", "调整操作需提供有效的 targetAccount 和 amount > 0");
      }
      if (payload.amount > record.amount) {
        throw new ReviewError("AMOUNT_EXCEEDED", `调整金额不能超过原始金额 ¥${record.amount.toFixed(2)}`);
      }

      // scope 校验：targetAccount 必须在同 (companyCode, year) 下存在
      const targetExists = await prisma.financeAccount.findFirst({
        where: { code: payload.targetAccount, companyCode: record.period.companyCode, year: record.period.year },
        select: { code: true },
      });
      if (!targetExists) {
        throw new ReviewError("INVALID_TARGET", `目标科目 ${payload.targetAccount} 在当前公司/年度范围内不存在`);
      }

      updateData = { status: "adjusted", targetAccount: payload.targetAccount, amount: payload.amount, note, adjustedBy: userId, adjustedAt: now };
      break;
    }

    case "revert":
      if (record.status === "pending") throw new ReviewError("ALREADY_PENDING", "该记录已是待审核状态");
      updateData = { status: "pending", targetAccount: record.sourceAccount, amount: record.amount, note: null, adjustedBy: userId, adjustedAt: now };
      break;

    case "mark_pending":
      if (record.status === "pending") throw new ReviewError("ALREADY_PENDING", "该记录已是待审核状态");
      updateData = { status: "pending", targetAccount: record.targetAccount, amount: record.amount, note, adjustedBy: userId, adjustedAt: now };
      break;

    default:
      throw new ReviewError("INVALID_ACTION", "无效的审核动作");
  }

  // 3. 更新
  const updated = await prisma.reclassResult.update({
    where: { id },
    data: updateData,
    include: {
      voucherItem: {
        select: {
          relatedEntity: true,
          description: true,
          account: { select: { name: true } },
          voucher: { select: { voucherNo: true, date: true } },
        },
      },
      rule: { select: { abnormalSide: true } },
      reviewer: { select: { name: true } },
    },
  });

  // 3b. adjust 后沉淀 itemRule + 全公司同步（在 update 之后，避免竞态）
  if (payload.action === "adjust" && updated.voucherItem.description) {
    await prisma.financeReclassItemRule.upsert({
      where: { companyCode_sourceAccountCode_matchType_matchValue: { companyCode: record.period.companyCode, sourceAccountCode: updated.sourceAccount, matchType: "exact_description", matchValue: updated.voucherItem.description } },
      create: { companyCode: record.period.companyCode, sourceAccountCode: updated.sourceAccount, matchType: "exact_description", matchValue: updated.voucherItem.description, targetAccountCode: updated.targetAccount, note: "凭证明细调整" },
      update: { targetAccountCode: updated.targetAccount },
    });
    await syncReclassRuleResults(record.period.companyCode);
  }

  // 4. 返回 DTO
  return {
    id: updated.id,
    periodId: updated.periodId,
    voucherItemId: updated.voucherItemId,
    voucherNo: updated.voucherItem.voucher.voucherNo,
    voucherDate: updated.voucherItem.voucher.date,
    relatedEntity: updated.voucherItem.relatedEntity,
    description: updated.voucherItem.description,
    sourceAccount: updated.sourceAccount,
    sourceAccountName: updated.voucherItem.account.name,
    abnormalSide: updated.rule?.abnormalSide ?? null,
    itemDebit: 0,
    itemCredit: 0,
    targetAccount: updated.targetAccount,
    amount: updated.amount,
    status: updated.status as ReclassResultRow["status"],
    note: updated.note,
    adjustedBy: updated.adjustedBy,
    adjustedByName: updated.reviewer?.name ?? null,
    adjustedAt: updated.adjustedAt?.toISOString() ?? null,
  };
}

// ─── Create Manual ───────────────────────────────────────

export async function createManualReclassResult(params: {
  periodId: number;
  voucherItemId: number;
  sourceAccount: string;
  targetAccount: string;
  amount: number;
  description?: string;
  userId: number;
}): Promise<ReclassResultRow> {
  const { periodId, voucherItemId, sourceAccount, targetAccount, amount, description, userId } = params;

  const period = await prisma.financePeriod.findUnique({
    where: { id: periodId },
    select: { companyCode: true, year: true },
  });
  if (!period || !period.companyCode) throw new ReviewError("NOT_FOUND", "期间不存在");

  // 校验目标科目
  const targetExists = await prisma.financeAccount.findFirst({
    where: { code: targetAccount, companyCode: period.companyCode, year: period.year },
    select: { code: true },
  });
  if (!targetExists) throw new ReviewError("INVALID_TARGET", `目标科目 ${targetAccount} 不存在`);
  if (amount <= 0) throw new ReviewError("INVALID_AMOUNT", "金额必须大于 0");

  // Upsert ReclassResult（防重复点击 500）
  const created = await prisma.reclassResult.upsert({
    where: { periodId_voucherItemId: { periodId, voucherItemId } },
    create: { periodId, voucherItemId, sourceAccount, targetAccount, amount, status: "adjusted", adjustedBy: userId, adjustedAt: new Date() },
    update: { sourceAccount, targetAccount, amount, status: "adjusted", adjustedBy: userId, adjustedAt: new Date() },
    include: {
      voucherItem: { select: { relatedEntity: true, description: true, account: { select: { name: true } }, voucher: { select: { voucherNo: true, date: true } } } },
      rule: { select: { abnormalSide: true } },
      reviewer: { select: { name: true } },
    },
  });

  // 沉淀明细例外规则
  const desc = description || created.voucherItem.description;
  if (desc) {
    await prisma.financeReclassItemRule.upsert({
      where: { companyCode_sourceAccountCode_matchType_matchValue: { companyCode: period.companyCode, sourceAccountCode: sourceAccount, matchType: "exact_description", matchValue: desc } },
      create: { companyCode: period.companyCode, sourceAccountCode: sourceAccount, matchType: "exact_description", matchValue: desc, targetAccountCode: targetAccount, note: "凭证明细手动调整" },
      update: { targetAccountCode: targetAccount },
    });
  }

  // 全公司同步（await 确保报表立即可读）
  await syncReclassRuleResults(period.companyCode);

  return {
    id: created.id, periodId: created.periodId, voucherItemId: created.voucherItemId,
    voucherNo: created.voucherItem.voucher.voucherNo, voucherDate: created.voucherItem.voucher.date,
    relatedEntity: created.voucherItem.relatedEntity, description: created.voucherItem.description,
    sourceAccount: created.sourceAccount, sourceAccountName: created.voucherItem.account.name,
    abnormalSide: created.rule?.abnormalSide ?? null, itemDebit: 0, itemCredit: 0,
    targetAccount: created.targetAccount, amount: created.amount,
    status: created.status as ReclassResultRow["status"],
    note: created.note, adjustedBy: created.adjustedBy, adjustedByName: created.reviewer?.name ?? null,
    adjustedAt: created.adjustedAt?.toISOString() ?? null,
  };
}

// ─── Error ────────────────────────────────────────────────

export class ReviewError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ReviewError";
  }
}
