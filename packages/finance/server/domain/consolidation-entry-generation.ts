export type ConsolidationVoucherMatchCategory = "investmentEquity" | "intercompanyBalance";

export interface ConsolidationVoucherMatchFact {
  itemId: number;
  voucherId: number;
  voucherNo: string;
  voucherDate: string;
  companyId: number;
  counterpartyCompanyId: number | null;
  accountCode: string;
  accountName: string;
  description: string | null;
  lineCode: string | null;
  signedAmount: number;
  currencyCode: string;
  sourceFingerprint: string;
  investmentRole?: "investment" | "equity";
}

export interface ConsolidationVoucherMatchGroup {
  category: ConsolidationVoucherMatchCategory;
  generationKey: string;
  status: "matched" | "difference" | "unresolved";
  leftCompanyId: number;
  rightCompanyId: number | null;
  leftFacts: ConsolidationVoucherMatchFact[];
  rightFacts: ConsolidationVoucherMatchFact[];
  leftNetAmount: number;
  rightNetAmount: number;
  matchedAmount: number;
  differenceAmount: number;
  matchingRule: string;
  matchingVersion: string;
  differenceResolution: string | null;
}

function cents(value: number) {
  return Math.round(value * 100);
}

function money(value: number) {
  return cents(value) / 100;
}

function total(facts: readonly ConsolidationVoucherMatchFact[]) {
  return money(facts.reduce((sum, fact) => sum + fact.signedAmount, 0));
}

function bySourceOrder(
  left: ConsolidationVoucherMatchFact,
  right: ConsolidationVoucherMatchFact,
) {
  return left.voucherDate.localeCompare(right.voucherDate)
    || left.voucherId - right.voucherId
    || left.itemId - right.itemId;
}

function hasUnmappedLine(...groups: ReadonlyArray<readonly ConsolidationVoucherMatchFact[]>) {
  return groups.some((facts) => facts.some((fact) => !fact.lineCode));
}

function hasMixedCurrencies(...groups: ReadonlyArray<readonly ConsolidationVoucherMatchFact[]>) {
  return new Set(groups.flatMap((facts) => facts.map((fact) => fact.currencyCode))).size > 1;
}

/**
 * Builds one voucher-detail match group per company pair. Every source journal line
 * remains visible in the group, so 1:N, N:1 and N:N evidence is not collapsed into
 * an auxiliary closing balance. Only exactly offsetting two-sided groups are matched.
 */
export function buildIntercompanyVoucherMatchGroups(
  facts: readonly ConsolidationVoucherMatchFact[],
): ConsolidationVoucherMatchGroup[] {
  const grouped = new Map<string, ConsolidationVoucherMatchFact[]>();
  for (const fact of facts) {
    const counterparty = fact.counterpartyCompanyId;
    if (!counterparty || counterparty === fact.companyId || cents(fact.signedAmount) === 0) continue;
    const pair = [fact.companyId, counterparty].sort((left, right) => left - right);
    const key = `${pair[0]}:${pair[1]}`;
    grouped.set(key, [...(grouped.get(key) ?? []), fact]);
  }

  return [...grouped.entries()].map(([pairKey, rows]) => {
    const [leftCompanyId, rightCompanyId] = pairKey.split(":").map(Number) as [number, number];
    const leftFacts = rows.filter((fact) => fact.companyId === leftCompanyId).sort(bySourceOrder);
    const rightFacts = rows.filter((fact) => fact.companyId === rightCompanyId).sort(bySourceOrder);
    const leftNetAmount = total(leftFacts);
    const rightNetAmount = total(rightFacts);
    const hasBothSides = leftFacts.length > 0 && rightFacts.length > 0;
    const mapped = !hasUnmappedLine(leftFacts, rightFacts);
    const comparableCurrency = !hasMixedCurrencies(leftFacts, rightFacts);
    const offsets = cents(leftNetAmount) !== 0
      && cents(leftNetAmount) === -cents(rightNetAmount);
    const status = !hasBothSides || !mapped || !comparableCurrency
      ? "unresolved" as const
      : offsets
        ? "matched" as const
        : "difference" as const;
    const differenceAmount = status === "matched"
      ? 0
      : money(Math.abs(leftNetAmount + rightNetAmount));
    return {
      category: "intercompanyBalance" as const,
      generationKey: `intercompanyBalance:${pairKey}`,
      status,
      leftCompanyId,
      rightCompanyId,
      leftFacts,
      rightFacts,
      leftNetAmount,
      rightNetAmount,
      matchedAmount: status === "matched" ? money(Math.abs(leftNetAmount)) : 0,
      differenceAmount,
      matchingRule: "按关联公司外键汇总双方全部已记账凭证明细；双方净额方向相反且分币一致",
      matchingVersion: "voucher-counterparty-pair-v1",
      differenceResolution: !hasBothSides
        ? "缺少对方公司凭证明细"
        : !mapped
          ? "存在未映射到合并报表项目的凭证明细"
          : !comparableCurrency
            ? "双方功能币不一致，当前范围未启用交易级汇率折算，需人工复核"
          : status === "difference"
            ? "双方凭证明细净额不一致，需核对未达、错账或关联公司映射"
            : null,
    };
  }).sort((left, right) => left.generationKey.localeCompare(right.generationKey));
}

interface VoucherFactGroup {
  voucherId: number;
  voucherDate: string;
  companyId: number;
  facts: ConsolidationVoucherMatchFact[];
  netAmount: number;
}

function groupInvestmentVoucherFacts(
  facts: readonly ConsolidationVoucherMatchFact[],
  role: "investment" | "equity",
) {
  const grouped = new Map<number, ConsolidationVoucherMatchFact[]>();
  for (const fact of facts) {
    if (fact.investmentRole !== role || cents(fact.signedAmount) === 0) continue;
    grouped.set(fact.voucherId, [...(grouped.get(fact.voucherId) ?? []), fact]);
  }
  return [...grouped.entries()].map(([voucherId, rows]): VoucherFactGroup => ({
    voucherId,
    voucherDate: rows[0]!.voucherDate,
    companyId: rows[0]!.companyId,
    facts: rows.sort(bySourceOrder),
    netAmount: total(rows),
  })).sort((left, right) => left.voucherDate.localeCompare(right.voucherDate) || left.voucherId - right.voucherId);
}

function unresolvedInvestmentGroup(
  parentCompanyId: number,
  source: VoucherFactGroup,
  side: "left" | "right",
  reason: string,
): ConsolidationVoucherMatchGroup {
  const sourceAmount = money(Math.abs(source.netAmount));
  return {
    category: "investmentEquity",
    generationKey: `investmentEquity:unresolved:${side}:${source.voucherId}`,
    status: "unresolved",
    leftCompanyId: parentCompanyId,
    rightCompanyId: side === "right" ? source.companyId : null,
    leftFacts: side === "left" ? source.facts : [],
    rightFacts: side === "right" ? source.facts : [],
    leftNetAmount: side === "left" ? source.netAmount : 0,
    rightNetAmount: side === "right" ? source.netAmount : 0,
    matchedAmount: 0,
    differenceAmount: sourceAmount,
    matchingRule: "母公司投资凭证与子公司权益凭证按日期、金额及唯一候选匹配",
    matchingVersion: "investment-voucher-unique-v1",
    differenceResolution: reason,
  };
}

/**
 * Investment identity cannot be inferred from voucher text. A pair is therefore
 * matched only when the parent investment voucher and one subsidiary equity voucher
 * are each other's unique, same-date, exactly offsetting candidate.
 */
export function buildInvestmentVoucherMatchGroups(
  facts: readonly ConsolidationVoucherMatchFact[],
  parentCompanyId: number,
  subsidiaryCompanyIds: readonly number[],
): ConsolidationVoucherMatchGroup[] {
  const subsidiaries = new Set(subsidiaryCompanyIds);
  const parentVouchers = groupInvestmentVoucherFacts(
    facts.filter((fact) => fact.companyId === parentCompanyId),
    "investment",
  );
  const equityVouchers = groupInvestmentVoucherFacts(
    facts.filter((fact) => subsidiaries.has(fact.companyId)),
    "equity",
  );
  const candidatesForParent = new Map<number, VoucherFactGroup[]>();
  const candidatesForEquity = new Map<number, VoucherFactGroup[]>();

  for (const parent of parentVouchers) {
    const explicitTargets = [...new Set(parent.facts.flatMap((fact) => (
      fact.counterpartyCompanyId ? [fact.counterpartyCompanyId] : []
    )))];
    const candidates = equityVouchers.filter((equity) => (
      equity.voucherDate === parent.voucherDate
      && cents(parent.netAmount) === -cents(equity.netAmount)
      && (explicitTargets.length === 0 || explicitTargets.length === 1 && explicitTargets[0] === equity.companyId)
    ));
    candidatesForParent.set(parent.voucherId, candidates);
    for (const equity of candidates) {
      candidatesForEquity.set(equity.voucherId, [...(candidatesForEquity.get(equity.voucherId) ?? []), parent]);
    }
  }

  const matchedEquityIds = new Set<number>();
  const result: ConsolidationVoucherMatchGroup[] = [];
  for (const parent of parentVouchers) {
    const candidates = candidatesForParent.get(parent.voucherId) ?? [];
    const equity = candidates.length === 1 ? candidates[0] : null;
    const reciprocalParents = equity ? candidatesForEquity.get(equity.voucherId) ?? [] : [];
    if (!equity || reciprocalParents.length !== 1 || hasUnmappedLine(parent.facts, equity.facts) || hasMixedCurrencies(parent.facts, equity.facts)) {
      const reason = hasUnmappedLine(parent.facts, ...(equity ? [equity.facts] : []))
        ? "存在未映射到合并报表项目的凭证明细"
        : equity && hasMixedCurrencies(parent.facts, equity.facts)
          ? "双方功能币不一致；并购日历史汇率折算尚未启用，不能自动抵销"
        : candidates.length === 0
          ? "未找到同日、等额且方向相反的子公司权益凭证"
          : "存在多个同日等额候选，不能据摘要猜测被投资公司";
      result.push(unresolvedInvestmentGroup(parentCompanyId, parent, "left", reason));
      continue;
    }
    matchedEquityIds.add(equity.voucherId);
    result.push({
      category: "investmentEquity",
      generationKey: `investmentEquity:${parent.voucherId}:${equity.voucherId}`,
      status: "matched",
      leftCompanyId: parentCompanyId,
      rightCompanyId: equity.companyId,
      leftFacts: parent.facts,
      rightFacts: equity.facts,
      leftNetAmount: parent.netAmount,
      rightNetAmount: equity.netAmount,
      matchedAmount: money(Math.abs(parent.netAmount)),
      differenceAmount: 0,
      matchingRule: "母公司投资凭证与子公司权益凭证按日期、金额及唯一候选匹配",
      matchingVersion: "investment-voucher-unique-v1",
      differenceResolution: null,
    });
  }

  for (const equity of equityVouchers) {
    if (!matchedEquityIds.has(equity.voucherId)) {
      result.push(unresolvedInvestmentGroup(
        parentCompanyId,
        equity,
        "right",
        "未找到可唯一对应的母公司长期股权投资凭证",
      ));
    }
  }
  return result.sort((left, right) => left.generationKey.localeCompare(right.generationKey));
}
