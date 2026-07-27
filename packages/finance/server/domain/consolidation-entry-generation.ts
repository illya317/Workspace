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
  comparisonCurrencyCode: string | null;
  requiredActions: ConsolidationMatchRequiredAction[];
  ownershipShareRatio: number | null;
}

export type ConsolidationMatchRequiredAction =
  | "identifyCounterpart"
  | "mapStatementLine"
  | "translateToCny"
  | "allocateNonControllingInterest"
  | "reconcileDifference";

export interface ConsolidationInvestmentRelationship {
  investorCompanyId: number;
  investeeCompanyId: number;
  shareRatio: number | null;
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

function isCnyComparable(...groups: ReadonlyArray<readonly ConsolidationVoucherMatchFact[]>) {
  return !hasMixedCurrencies(...groups)
    && groups.flatMap((facts) => facts).every((fact) => fact.currencyCode.toUpperCase() === "CNY");
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
    const rows = grouped.get(key);
    if (rows) rows.push(fact);
    else grouped.set(key, [fact]);
  }

  return [...grouped.entries()].map(([pairKey, rows]): ConsolidationVoucherMatchGroup => {
    const [leftCompanyId, rightCompanyId] = pairKey.split(":").map(Number) as [number, number];
    const leftFacts = rows.filter((fact) => fact.companyId === leftCompanyId).sort(bySourceOrder);
    const rightFacts = rows.filter((fact) => fact.companyId === rightCompanyId).sort(bySourceOrder);
    const leftNetAmount = total(leftFacts);
    const rightNetAmount = total(rightFacts);
    const hasBothSides = leftFacts.length > 0 && rightFacts.length > 0;
    const mapped = !hasUnmappedLine(leftFacts, rightFacts);
    const comparableCurrency = isCnyComparable(leftFacts, rightFacts);
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
            ? "双方金额尚未在人民币列报口径下可比，需先应用有证据的汇率折算"
          : status === "difference"
            ? "双方凭证明细净额不一致，需核对未达、错账或关联公司映射"
            : null,
      comparisonCurrencyCode: comparableCurrency
        ? leftFacts[0]?.currencyCode ?? rightFacts[0]?.currencyCode ?? null
        : null,
      requiredActions: !hasBothSides
        ? ["identifyCounterpart"]
        : !mapped
          ? ["mapStatementLine"]
          : !comparableCurrency
            ? ["translateToCny"]
            : status === "difference"
              ? ["reconcileDifference"]
              : [],
      ownershipShareRatio: null,
    };
  }).filter((group) => cents(group.leftNetAmount) !== 0 || cents(group.rightNetAmount) !== 0)
    .sort((left, right) => left.generationKey.localeCompare(right.generationKey));
}

function relationshipKey(relationship: ConsolidationInvestmentRelationship) {
  return `${relationship.investorCompanyId}:${relationship.investeeCompanyId}`;
}

function percentage(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

/**
 * Builds one N:N evidence group for every direct legal ownership relationship.
 * Intermediate holding companies are valid investors. Voucher text is never used
 * to prove ownership: untagged investment lines are assigned only when the frozen
 * ownership graph plus available investee equity evidence leaves one candidate.
 */
export function buildInvestmentVoucherMatchGroups(
  facts: readonly ConsolidationVoucherMatchFact[],
  relationships: readonly ConsolidationInvestmentRelationship[],
): ConsolidationVoucherMatchGroup[] {
  const orderedRelationships = [...relationships]
    .filter((relationship) => relationship.investorCompanyId !== relationship.investeeCompanyId)
    .sort((left, right) => left.investorCompanyId - right.investorCompanyId
      || left.investeeCompanyId - right.investeeCompanyId);
  const relationshipsByInvestor = new Map<number, ConsolidationInvestmentRelationship[]>();
  for (const relationship of orderedRelationships) {
    const rows = relationshipsByInvestor.get(relationship.investorCompanyId);
    if (rows) rows.push(relationship);
    else relationshipsByInvestor.set(relationship.investorCompanyId, [relationship]);
  }
  const equityFactsByCompany = new Map<number, ConsolidationVoucherMatchFact[]>();
  for (const fact of facts) {
    if (fact.investmentRole !== "equity" || cents(fact.signedAmount) === 0) continue;
    const rows = equityFactsByCompany.get(fact.companyId);
    if (rows) rows.push(fact);
    else equityFactsByCompany.set(fact.companyId, [fact]);
  }
  const investmentsByRelationship = new Map<string, ConsolidationVoucherMatchFact[]>();
  const unresolvedInvestmentsByCompany = new Map<number, ConsolidationVoucherMatchFact[]>();
  for (const fact of facts) {
    if (fact.investmentRole !== "investment" || cents(fact.signedAmount) === 0) continue;
    const owned = relationshipsByInvestor.get(fact.companyId) ?? [];
    const candidates = fact.counterpartyCompanyId
      ? [{
          investorCompanyId: fact.companyId,
          investeeCompanyId: fact.counterpartyCompanyId,
          shareRatio: owned.find((relationship) => relationship.investeeCompanyId === fact.counterpartyCompanyId)?.shareRatio
            ?? orderedRelationships.find((relationship) => relationship.investeeCompanyId === fact.counterpartyCompanyId)?.shareRatio
            ?? null,
        }]
      : (() => {
          const withEquityEvidence = owned.filter((relationship) => (
            (equityFactsByCompany.get(relationship.investeeCompanyId) ?? []).length > 0
          ));
          return withEquityEvidence.length === 1 ? withEquityEvidence : owned.length === 1 ? owned : [];
        })();
    if (candidates.length === 1) {
      const key = relationshipKey(candidates[0]!);
      const rows = investmentsByRelationship.get(key);
      if (rows) rows.push(fact);
      else investmentsByRelationship.set(key, [fact]);
    } else {
      const rows = unresolvedInvestmentsByCompany.get(fact.companyId);
      if (rows) rows.push(fact);
      else unresolvedInvestmentsByCompany.set(fact.companyId, [fact]);
    }
  }

  const explicitKeys = new Set(investmentsByRelationship.keys());
  const nonZeroExplicitKeysByInvestee = new Map<number, string[]>();
  for (const key of explicitKeys) {
    const [, investeeCompanyId] = key.split(":").map(Number) as [number, number];
    if (cents(total(investmentsByRelationship.get(key) ?? [])) === 0) continue;
    const keys = nonZeroExplicitKeysByInvestee.get(investeeCompanyId);
    if (keys) keys.push(key);
    else nonZeroExplicitKeysByInvestee.set(investeeCompanyId, [key]);
  }
  const relationshipByKey = new Map<string, ConsolidationInvestmentRelationship>();
  for (const relationship of orderedRelationships) {
    const key = relationshipKey(relationship);
    const explicitForInvestee = nonZeroExplicitKeysByInvestee.get(relationship.investeeCompanyId) ?? [];
    if (explicitForInvestee.length === 0 || explicitForInvestee.includes(key)) {
      relationshipByKey.set(key, relationship);
    }
  }
  for (const key of explicitKeys) {
    if (relationshipByKey.has(key)) continue;
    const [investorCompanyId, investeeCompanyId] = key.split(":").map(Number) as [number, number];
    relationshipByKey.set(key, {
      investorCompanyId,
      investeeCompanyId,
      shareRatio: orderedRelationships.find((relationship) => relationship.investeeCompanyId === investeeCompanyId)?.shareRatio ?? null,
    });
  }

  const result = [...relationshipByKey.values()].flatMap((relationship): ConsolidationVoucherMatchGroup[] => {
    const key = relationshipKey(relationship);
    const leftFacts = (investmentsByRelationship.get(key) ?? []).sort(bySourceOrder);
    const explicitForInvestee = nonZeroExplicitKeysByInvestee.get(relationship.investeeCompanyId) ?? [];
    const receivesEquity = explicitForInvestee.length === 0 || explicitForInvestee.length === 1 && explicitForInvestee[0] === key;
    const sourceRightFacts = receivesEquity
      ? (equityFactsByCompany.get(relationship.investeeCompanyId) ?? []).sort(bySourceOrder)
      : [];
    if (leftFacts.length === 0 && sourceRightFacts.length === 0) return [];
    const leftNetAmount = total(leftFacts);
    const rightFacts = sourceRightFacts;
    const rightNetAmount = total(rightFacts);
    const hasBothSides = leftFacts.length > 0 && rightFacts.length > 0;
    const mapped = !hasUnmappedLine(leftFacts, rightFacts);
    const comparableCurrency = isCnyComparable(leftFacts, rightFacts);
    const whollyOwned = relationship.shareRatio === 1;
    const offsets = comparableCurrency
      && cents(leftNetAmount) !== 0
      && cents(leftNetAmount) === -cents(rightNetAmount);
    const status = !hasBothSides || !mapped || !comparableCurrency || !whollyOwned
      ? "unresolved" as const
      : offsets
        ? "matched" as const
        : "difference" as const;
    const differenceAmount = status === "matched" || !comparableCurrency
      ? 0
      : money(Math.abs(leftNetAmount + rightNetAmount));
    const ownershipIssue = relationship.shareRatio === null
      ? "直接持股比例尚未确认，不能计算投资与权益抵销"
      : !whollyOwned
        ? `直接持股比例为 ${percentage(relationship.shareRatio)}，需先计算少数股东权益，不能按 100% 自动抵销`
        : null;
    return [{
      category: "investmentEquity",
      generationKey: `investmentEquity:relationship:${key}`,
      status,
      leftCompanyId: relationship.investorCompanyId,
      rightCompanyId: relationship.investeeCompanyId,
      leftFacts,
      rightFacts,
      leftNetAmount,
      rightNetAmount,
      matchedAmount: status === "matched" ? money(Math.abs(leftNetAmount)) : 0,
      differenceAmount,
      matchingRule: "按批次冻结的直接持股关系归集投资方与被投资方全部凭证明细；外币金额仅在存在投资日汇率证据时折合，不按一侧账面成本镜像；组内保留 N:N 原始凭证证据",
      matchingVersion: "investment-direct-relationship-fx-evidence-v2",
      differenceResolution: !hasBothSides
        ? leftFacts.length === 0 && rightFacts.length === 0
          ? "直接持股关系下未找到投资方或被投资方相关凭证明细"
          : leftFacts.length === 0
            ? "缺少投资方长期股权投资凭证明细"
            : "缺少被投资方实收资本或资本公积凭证明细"
        : ownershipIssue && !comparableCurrency
          ? `${ownershipIssue}；双方功能币不同，还需按投资发生日历史汇率折算`
          : ownershipIssue
          ?? (!mapped
            ? "存在未映射到合并报表项目的凭证明细"
            : !comparableCurrency
              ? "双方功能币不同，需按投资发生日历史汇率折算后再计算抵销"
              : status === "difference"
                ? "同币种双方凭证明细净额不一致，需核对投资成本、权益构成或遗漏凭证"
                : null),
      comparisonCurrencyCode: comparableCurrency
        ? leftFacts[0]?.currencyCode ?? rightFacts[0]?.currencyCode ?? null
        : null,
      requiredActions: [
        ...(!hasBothSides ? ["identifyCounterpart" as const] : []),
        ...(hasBothSides && !mapped ? ["mapStatementLine" as const] : []),
        ...(hasBothSides && !comparableCurrency ? ["translateToCny" as const] : []),
        ...(relationship.shareRatio !== 1 ? ["allocateNonControllingInterest" as const] : []),
        ...(hasBothSides && mapped && comparableCurrency && whollyOwned && status === "difference"
          ? ["reconcileDifference" as const]
          : []),
      ],
      ownershipShareRatio: relationship.shareRatio,
    }];
  });

  for (const [investorCompanyId, unresolvedFacts] of unresolvedInvestmentsByCompany) {
    const leftFacts = unresolvedFacts.sort(bySourceOrder);
    result.push({
      category: "investmentEquity",
      generationKey: `investmentEquity:unresolved-investor:${investorCompanyId}`,
      status: "unresolved",
      leftCompanyId: investorCompanyId,
      rightCompanyId: null,
      leftFacts,
      rightFacts: [],
      leftNetAmount: total(leftFacts),
      rightNetAmount: 0,
      matchedAmount: 0,
      differenceAmount: money(Math.abs(total(leftFacts))),
      matchingRule: "投资凭证只能按批次冻结的直接持股关系归集，不根据摘要猜测被投资公司",
      matchingVersion: "investment-direct-relationship-nn-v1",
      differenceResolution: "投资方存在多个直接被投资公司，且凭证未携带唯一关联公司证据",
      comparisonCurrencyCode: leftFacts[0]?.currencyCode ?? null,
      requiredActions: ["identifyCounterpart"],
      ownershipShareRatio: null,
    });
  }
  return result.filter((group) => cents(group.leftNetAmount) !== 0 || cents(group.rightNetAmount) !== 0)
    .sort((left, right) => left.generationKey.localeCompare(right.generationKey));
}
