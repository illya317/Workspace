/**
 * M4: 科目余额校对树
 *
 * 输出真正的 L1→L2→L3 科目树，基于 FinanceAccount.parentId。
 * childrenSum = 直接子级余额之和；leafSum = 全部叶子余额之和。
 * Leaf balance 单独校验。
 */
import { prisma } from "@/lib/prisma";

interface AccountNode {
  code: string; name: string; level: number;
  closingDebit: number; closingCredit: number;
  net: number;
  /** 直接子级余额之和 */
  childrenSumDebit: number; childrenSumCredit: number;
  /** 直接子级 diff */
  diffDebit: number; diffCredit: number;
  isBalanced: boolean;
  /** 全部叶子余额之和 */
  leafSumDebit: number; leafSumCredit: number;
  leafDiffDebit: number; leafDiffCredit: number;
  children: AccountNode[];
}

export async function checkAccountBalanceTree(
  companyCode: string, year: number, month: number,
): Promise<{ tree: AccountNode[]; summary: { totalLeafDebit: number; totalLeafCredit: number; leafBalanced: boolean } }> {
  const period = await prisma.financePeriod.findFirst({
    where: { companyCode, year, month },
    select: { id: true },
  });
  if (!period) throw new Error("期间不存在");

  const balances = await prisma.financeAccountBalance.findMany({
    where: { periodId: period.id },
    include: {
      account: {
        select: { code: true, name: true, subjectLevel: true, parentId: true },
      },
    },
    orderBy: { account: { code: "asc" } },
  });

  // Build map: id → balance
  const idMap = new Map<number, { code: string; name: string; level: number; parentId: number | null; debit: number; credit: number }>();
  for (const b of balances) {
    idMap.set(b.accountId, {
      code: b.account.code,
      name: b.account.name,
      level: b.account.subjectLevel || 0,
      parentId: b.account.parentId,
      debit: b.closingDebit,
      credit: b.closingCredit,
    });
  }

  // Build code → balance (for leaf check)
  const codeMap = new Map<string, { debit: number; credit: number }>();
  for (const [, v] of idMap) {
    codeMap.set(v.code, { debit: v.debit, credit: v.credit });
  }

  // Build parent→children index
  const childrenByParent = new Map<number, number[]>();
  for (const [id, v] of idMap) {
    if (v.parentId != null) {
      const list = childrenByParent.get(v.parentId) || [];
      list.push(id);
      childrenByParent.set(v.parentId, list);
    }
  }

  // Top-level nodes: parentId IS NULL
  function buildNode(accountId: number): AccountNode {
    const v = idMap.get(accountId)!;
    const childIds = childrenByParent.get(accountId) || [];
    const children = childIds.map(buildNode);

    // Direct children sum
    const csD = children.reduce((s, c) => s + c.closingDebit, 0);
    const csC = children.reduce((s, c) => s + c.closingCredit, 0);

    // Leaf sum (if no children, use own)
    const isLeaf = children.length === 0;
    let lsD = 0, lsC = 0;
    if (isLeaf) {
      lsD = v.debit; lsC = v.credit;
    } else {
      for (const c of children) {
        if (c.children.length === 0) {
          lsD += c.closingDebit; lsC += c.closingCredit;
        } else {
          lsD += c.leafSumDebit; lsC += c.leafSumCredit;
        }
      }
    }

    return {
      code: v.code, name: v.name, level: v.level,
      closingDebit: v.debit, closingCredit: v.credit,
      net: v.debit - v.credit,
      childrenSumDebit: csD, childrenSumCredit: csC,
      diffDebit: Math.round((v.debit - csD) * 100) / 100,
      diffCredit: Math.round((v.credit - csC) * 100) / 100,
      isBalanced: isLeaf || (Math.abs(v.debit - csD) < 0.01 && Math.abs(v.credit - csC) < 0.01),
      leafSumDebit: Math.round(lsD * 100) / 100,
      leafSumCredit: Math.round(lsC * 100) / 100,
      leafDiffDebit: Math.round((v.debit - lsD) * 100) / 100,
      leafDiffCredit: Math.round((v.credit - lsC) * 100) / 100,
      children,
    };
  }

  // Top-level: parentId IS NULL
  const topIds = [...idMap.keys()].filter(id => {
    const v = idMap.get(id)!;
    return v.parentId == null;
  });
  const tree = topIds.map(buildNode);

  // Leaf balance check
  let totalLeafDebit = 0, totalLeafCredit = 0;
  for (const [id, v] of idMap) {
    if (!childrenByParent.has(id)) {
      totalLeafDebit += v.debit;
      totalLeafCredit += v.credit;
    }
  }

  return {
    tree,
    summary: {
      totalLeafDebit: Math.round(totalLeafDebit * 100) / 100,
      totalLeafCredit: Math.round(totalLeafCredit * 100) / 100,
      leafBalanced: Math.abs(totalLeafDebit - totalLeafCredit) < 0.01,
    },
  };
}
