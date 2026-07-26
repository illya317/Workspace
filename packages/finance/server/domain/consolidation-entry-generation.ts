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
  investmentMatchingPolicy?: "direct" | "aggregateCnyMirror";
  consolidationAmount?: number;
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
  return money(facts.reduce((sum, fact) => sum + (fact.consolidationAmount ?? fact.signedAmount), 0));
}

function allocateAggregateMirror(
  facts: readonly ConsolidationVoucherMatchFact[],
  targetNetAmount: number,
) {
  const sourceNet = money(facts.reduce((sum, fact) => sum + fact.signedAmount, 0));
  if (cents(sourceNet) === 0) return [...facts];
  const result: ConsolidationVoucherMatchFact[] = [];
  let allocated = 0;
  for (const [index, fact] of facts.entries()) {
    const consolidationAmount = index === facts.length - 1
      ? money(targetNetAmount - allocated)
      : money(fact.signedAmount * targetNetAmount / sourceNet);
    allocated = money(allocated + consolidationAmount);
    result.push({ ...fact, consolidationAmount });
  }
  return result;
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
    const rows = grouped.get(key);
    if (rows) rows.push(fact);
    else grouped.set(key, [fact]);
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
    const aggregateCnyMirror = leftFacts.length > 0
      && leftFacts.every((fact) => fact.investmentMatchingPolicy === "aggregateCnyMirror");
    const leftNetAmount = total(leftFacts);
    const rightFacts = aggregateCnyMirror
      ? allocateAggregateMirror(sourceRightFacts, -leftNetAmount)
      : sourceRightFacts;
    const rightNetAmount = total(rightFacts);
    const hasBothSides = leftFacts.length > 0 && rightFacts.length > 0;
    const mapped = !hasUnmappedLine(leftFacts, rightFacts);
    const comparableCurrency = !hasMixedCurrencies(leftFacts, rightFacts);
    const whollyOwned = relationship.shareRatio === 1;
    const offsets = (comparableCurrency || aggregateCnyMirror)
      && cents(leftNetAmount) !== 0
      && cents(leftNetAmount) === -cents(rightNetAmount);
    const status = !hasBothSides || !mapped || !comparableCurrency && !aggregateCnyMirror || !whollyOwned && !aggregateCnyMirror
      ? "unresolved" as const
      : offsets
        ? "matched" as const
        : "difference" as const;
    const differenceAmount = status === "matched" || !comparableCurrency && !aggregateCnyMirror
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
      matchingRule: aggregateCnyMirror
        ? "按已核定公司映射归集双方全部凭证明细；外币权益凭证按投资方人民币账面成本汇总镜像，保留每笔原币来源"
        : "按批次冻结的直接持股关系归集投资方与被投资方全部凭证明细；组内保留 N:N 原始凭证证据",
      matchingVersion: aggregateCnyMirror ? "investment-aggregate-cny-mirror-v1" : "investment-direct-relationship-nn-v1",
      differenceResolution: !hasBothSides
        ? leftFacts.length === 0 && rightFacts.length === 0
          ? "直接持股关系下未找到投资方或被投资方相关凭证明细"
          : leftFacts.length === 0
            ? "缺少投资方长期股权投资凭证明细"
            : "缺少被投资方实收资本或资本公积凭证明细"
        : aggregateCnyMirror
          ? null
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
    });
  }
  return result.filter((group) => cents(group.leftNetAmount) !== 0 || cents(group.rightNetAmount) !== 0)
    .sort((left, right) => left.generationKey.localeCompare(right.generationKey));
}
