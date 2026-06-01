/**
 * M4: 一级科目余额校对
 *
 * 输出 L1/L2 科目树，校验父子汇总一致性。
 * 纯余额数据，不依赖报表配置。
 */
import { prisma } from "@/lib/prisma";

interface AccountNode {
  code: string; name: string; level: number;
  closingDebit: number; closingCredit: number;
  net: number;
  childrenSumDebit: number; childrenSumCredit: number;
  diffDebit: number; diffCredit: number;
  isBalanced: boolean;
  children: AccountNode[];
}

export async function checkAccountBalanceTree(
  companyCode: string, year: number, month: number,
): Promise<{ tree: AccountNode[]; summary: { totalDebit: number; totalCredit: number; leafBalanced: boolean } }> {
  const period = await prisma.financePeriod.findFirst({
    where: { companyCode, year, month },
    select: { id: true },
  });
  if (!period) throw new Error("期间不存在");

  const balances = await prisma.financeAccountBalance.findMany({
    where: { periodId: period.id },
    include: { account: true },
    orderBy: { account: { code: "asc" } },
  });

  // Build code→balance map
  const balMap = new Map<string, { code: string; name: string; debit: number; credit: number }>();
  for (const b of balances) {
    balMap.set(b.account.code, {
      code: b.account.code,
      name: b.account.name,
      debit: b.closingDebit,
      credit: b.closingCredit,
    });
  }

  // Determine level by code length
  function getLevel(code: string): number {
    return code.length;
  }

  // Build tree: L1 nodes, with L2+ as children
  const allCodes = [...balMap.keys()];
  const parentSet = new Set<string>();
  for (const c1 of allCodes) {
    for (const c2 of allCodes) {
      if (c2 !== c1 && c2.startsWith(c1) && c2.length > c1.length) {
        parentSet.add(c1);
        break;
      }
    }
  }

  function getDirectChildren(parentCode: string): string[] {
    return allCodes.filter(c => {
      if (c === parentCode || !c.startsWith(parentCode)) return false;
      const remainder = c.slice(parentCode.length);
      // Direct child = no other account code between parent and this
      return !allCodes.some(other =>
        other !== parentCode && other !== c &&
        other.startsWith(parentCode) &&
        c.startsWith(other) &&
        other.length < c.length &&
        other.length > parentCode.length
      );
    });
  }

  function sumChildrenChildren(node: AccountNode): { d: number; c: number } {
    let d = 0, c = 0;
    for (const child of node.children) {
      const sub = sumChildrenChildren(child);
      d += child.closingDebit + sub.d;
      c += child.closingCredit + sub.c;
    }
    return { d, c };
  }

  function buildNode(code: string): AccountNode {
    const b = balMap.get(code);
    const directChildren = getDirectChildren(code);
    const children = directChildren.map(buildNode);

    let childrenSumD = 0, childrenSumC = 0;
    for (const child of children) {
      const sub = sumChildrenChildren(child);
      childrenSumD += child.closingDebit + sub.d;
      childrenSumC += child.closingCredit + sub.c;
    }

    const ownDebit = b ? b.debit : 0;
    const ownCredit = b ? b.credit : 0;
    const isLeaf = children.length === 0;
    const diffD = isLeaf ? 0 : ownDebit - childrenSumD;
    const diffC = isLeaf ? 0 : ownCredit - childrenSumC;

    return {
      code, name: b?.name || "", level: getLevel(code),
      closingDebit: ownDebit, closingCredit: ownCredit,
      net: ownDebit - ownCredit,
      childrenSumDebit: childrenSumD, childrenSumCredit: childrenSumC,
      diffDebit: Math.round(diffD * 100) / 100,
      diffCredit: Math.round(diffC * 100) / 100,
      isBalanced: isLeaf || (Math.abs(diffD) < 0.01 && Math.abs(diffC) < 0.01),
      children,
    };
  }

  // Build only L1 nodes as top-level tree entries
  const l1Codes = allCodes.filter(c => !parentSet.has(c));
  const tree = l1Codes.map(buildNode);

  // Compute leaf balance
  const leafCodes = allCodes.filter(c => !parentSet.has(c));
  let totalLeafDebit = 0, totalLeafCredit = 0;
  for (const code of leafCodes) {
    const b = balMap.get(code);
    if (b) { totalLeafDebit += b.debit; totalLeafCredit += b.credit; }
  }

  return {
    tree,
    summary: {
      totalDebit: Math.round(totalLeafDebit * 100) / 100,
      totalCredit: Math.round(totalLeafCredit * 100) / 100,
      leafBalanced: Math.abs(totalLeafDebit - totalLeafCredit) < 0.01,
    },
  };
}
