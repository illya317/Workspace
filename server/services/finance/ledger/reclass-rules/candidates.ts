/**
 * 规则候选扫描 — 核心逻辑
 *
 * 扫描指定 (companyCode, year) 下所有已过账凭证明细，
 * 按科目聚合异常方向金额，生成 RuleCandidate 列表。
 * 纯查询，不写 DB。
 */

import { prisma } from "@/lib/prisma";
import type { RuleCandidate, ScanCandidatesParams, ScanCandidatesResult } from "./types";

// ─── 辅助 ────────────────────────────────────────────────

/** 仅资产（1xxx）和负债（2xxx）类科目参与重分类候选 */
function isBalanceSheetAccount(code: string): boolean {
  return code.startsWith("1") || code.startsWith("2");
}

/** 根据科目编码前缀建议目标科目（v1 保守默认） */
function suggestTarget(accountCode: string): string {
  if (accountCode.startsWith("1")) return "2241"; // 资产异常贷方 → 其他应付款
  if (accountCode.startsWith("2")) return "1463"; // 负债异常借方 → 其他流动资产
  return ""; // 非资产负债表科目不会进入候选
}

/** 根据科目余额方向判定异常方向 */
function deriveAbnormalSide(balanceDirection: string): string {
  return balanceDirection === "debit" ? "credit" : "debit";
}

// ─── 主逻辑 ──────────────────────────────────────────────

export async function scanCandidates(
  params: ScanCandidatesParams,
): Promise<ScanCandidatesResult> {
  const { companyCode, year } = params;

  // 1. 查询所有已过账凭证明细（全年度跨月）
  const items = await prisma.financeVoucherItem.findMany({
    where: {
      voucher: {
        companyCode,
        status: "posted",
        period: { year, companyCode },
      },
      OR: [{ debit: { gt: 0 } }, { credit: { gt: 0 } }],
    },
    select: {
      debit: true,
      credit: true,
      account: {
        select: { code: true, name: true, balanceDirection: true },
      },
    },
  });

  // 2. 按 (accountCode, balanceDirection) 聚合借贷合计
  const aggKey = (code: string, dir: string) => `${code}::${dir}`;
  const agg = new Map<string, {
    code: string;
    name: string;
    balanceDirection: string;
    debitSum: number;
    creditSum: number;
  }>();

  for (const item of items) {
    const key = aggKey(item.account.code, item.account.balanceDirection);
    let entry = agg.get(key);
    if (!entry) {
      entry = {
        code: item.account.code,
        name: item.account.name,
        balanceDirection: item.account.balanceDirection,
        debitSum: 0,
        creditSum: 0,
      };
      agg.set(key, entry);
    }
    entry.debitSum += item.debit;
    entry.creditSum += item.credit;
  }

  // 3. 筛选异常方向（v1 仅资产/负债类科目参与重分类候选）
  const candidates: RuleCandidate[] = [];

  for (const entry of agg.values()) {
    const code = entry.code;
    if (!isBalanceSheetAccount(code)) continue;

    const abnormalSide = deriveAbnormalSide(entry.balanceDirection);
    const abnormalAmount = abnormalSide === "credit" ? entry.creditSum : entry.debitSum;

    if (abnormalAmount > 0) {
      candidates.push({
        accountCode: entry.code,
        accountName: entry.name,
        balanceDirection: entry.balanceDirection,
        abnormalSide,
        abnormalAmount: +abnormalAmount.toFixed(2),
        suggestedTarget: suggestTarget(entry.code),
        existingRuleId: null,
        existingTarget: null,
        existingSource: null,
        existingEnabled: null,
      });
    }
  }

  // 4. 批量查询已有规则
  const candidateCodes = [...new Set(candidates.map((c) => c.accountCode))];
  if (candidateCodes.length > 0) {
    const rules = await prisma.financeReclassRule.findMany({
      where: {
        companyCode,
        year,
        sourceAccountCode: { in: candidateCodes },
      },
      select: {
        id: true,
        sourceAccountCode: true,
        abnormalSide: true,
        targetAccountCode: true,
        source: true,
        enabled: true,
      },
    });

    // 按 (sourceAccountCode, abnormalSide) 索引
    const ruleMap = new Map<string, typeof rules[number]>();
    for (const r of rules) {
      ruleMap.set(`${r.sourceAccountCode}::${r.abnormalSide}`, r);
    }

    for (const c of candidates) {
      const rule = ruleMap.get(`${c.accountCode}::${c.abnormalSide}`);
      if (rule) {
        c.existingRuleId = rule.id;
        c.existingTarget = rule.targetAccountCode;
        c.existingSource = rule.source;
        c.existingEnabled = rule.enabled;
      }
    }
  }

  // 5. 排序：异常金额降序
  candidates.sort((a, b) => b.abnormalAmount - a.abnormalAmount);

  return {
    companyCode,
    year,
    candidates,
    stats: {
      totalAccountsScanned: [...agg.values()].filter(
        (e) => isBalanceSheetAccount(e.code),
      ).length,
      abnormalCount: candidates.length,
      withExistingRule: candidates.filter((c) => c.existingRuleId !== null).length,
      withoutRule: candidates.filter((c) => c.existingRuleId === null).length,
    },
  };
}
