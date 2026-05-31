export interface BalanceItem {
  account: { code: string; name: string };
  openingDebit: number;
  openingCredit: number;
  closingDebit: number;
  closingCredit: number;
  currentDebit: number;
  currentCredit: number;
}

export interface ReportPeriod {
  id: number;
  companyCode: string | null;
  year: number;
  month: number;
}

export function closingNetLeaf(balances: BalanceItem[], prefixes: string[]) {
  const matched = new Set<string>();
  for (const b of balances) {
    if (prefixes.some((p) => b.account.code.startsWith(p))) {
      matched.add(b.account.code);
    }
  }
  const codes = Array.from(matched);
  const parentCodes = new Set<string>();
  for (const c1 of codes) {
    for (const c2 of codes) {
      if (c2 !== c1 && c2.startsWith(c1) && c2.length > c1.length) {
        parentCodes.add(c1);
        break;
      }
    }
  }
  const leafCodes = new Set(codes.filter((c) => !parentCodes.has(c)));

  let debit = 0, credit = 0;
  for (const b of balances) {
    if (leafCodes.has(b.account.code)) {
      debit += b.closingDebit;
      credit += b.closingCredit;
    }
  }
  return { debit, credit };
}

export function yearlyCurrentLeaf(yearBalances: BalanceItem[], prefixes: string[], direction: "debit" | "credit" = "debit") {
  const matched = new Set<string>();
  for (const b of yearBalances) {
    if (prefixes.some((p) => b.account.code.startsWith(p))) {
      matched.add(b.account.code);
    }
  }
  const codes = Array.from(matched);
  const parentCodes = new Set<string>();
  for (const c1 of codes) {
    for (const c2 of codes) {
      if (c2 !== c1 && c2.startsWith(c1) && c2.length > c1.length) {
        parentCodes.add(c1);
        break;
      }
    }
  }
  const leafCodes = new Set(codes.filter((c) => !parentCodes.has(c)));

  let total = 0;
  for (const b of yearBalances) {
    if (leafCodes.has(b.account.code)) {
      total += direction === "debit" ? b.currentDebit : b.currentCredit;
    }
  }
  return total;
}

/** closingNetLeaf but only summing debit positions (for asset reclassification) */
export function closingNetLeafDebitOnly(balances: BalanceItem[], prefixes: string[]) {
  const { debit } = closingNetLeaf(balances, prefixes);
  // Only count accounts with net debit position
  const matched = new Set<string>();
  for (const b of balances) {
    if (prefixes.some((p) => b.account.code.startsWith(p))) {
      matched.add(b.account.code);
    }
  }
  const codes = Array.from(matched);
  const parentCodes = new Set<string>();
  for (const c1 of codes) {
    for (const c2 of codes) {
      if (c2 !== c1 && c2.startsWith(c1) && c2.length > c1.length) {
        parentCodes.add(c1);
        break;
      }
    }
  }
  const leafCodes = new Set(codes.filter((c) => !parentCodes.has(c)));
  let d = 0, c = 0;
  for (const b of balances) {
    if (leafCodes.has(b.account.code) && b.closingDebit > b.closingCredit) {
      d += b.closingDebit;
      c += b.closingCredit;
    }
  }
  return { debit: d, credit: c };
}

/** closingNetLeaf but only summing credit positions (for liability reclassification) */
export function closingNetLeafCreditOnly(balances: BalanceItem[], prefixes: string[]) {
  const matched = new Set<string>();
  for (const b of balances) {
    if (prefixes.some((p) => b.account.code.startsWith(p))) {
      matched.add(b.account.code);
    }
  }
  const codes = Array.from(matched);
  const parentCodes = new Set<string>();
  for (const c1 of codes) {
    for (const c2 of codes) {
      if (c2 !== c1 && c2.startsWith(c1) && c2.length > c1.length) {
        parentCodes.add(c1);
        break;
      }
    }
  }
  const leafCodes = new Set(codes.filter((c) => !parentCodes.has(c)));
  let d = 0, c = 0;
  for (const b of balances) {
    if (leafCodes.has(b.account.code) && b.closingCredit > b.closingDebit) {
      d += b.closingDebit;
      c += b.closingCredit;
    }
  }
  return { debit: d, credit: c };
}

/** Reclassify: asset accounts with net credit → liability pool, liability accounts with net debit → asset pool. Only leaf accounts to avoid double-counting with parent. */
export function reclassify(balances: BalanceItem[]) {
  // Determine leaf accounts
  const codes = balances.map(b => b.account.code);
  const parentCodes = new Set<string>();
  for (const c1 of codes) {
    for (const c2 of codes) {
      if (c2 !== c1 && c2.startsWith(c1) && c2.length > c1.length) {
        parentCodes.add(c1);
        break;
      }
    }
  }
  const leafCodes = new Set(codes.filter(c => !parentCodes.has(c)));

  let assetToLiability = { debit: 0, credit: 0 };
  let liabilityToAsset = { debit: 0, credit: 0 };

  for (const b of balances) {
    if (!leafCodes.has(b.account.code)) continue;
    const net = b.closingDebit - b.closingCredit;
    if (b.account.code.startsWith("1") && net < 0) {
      assetToLiability.debit += b.closingDebit;
      assetToLiability.credit += b.closingCredit;
    }
    if (b.account.code.startsWith("2") && net > 0) {
      liabilityToAsset.debit += b.closingDebit;
      liabilityToAsset.credit += b.closingCredit;
    }
  }
  return { assetToLiability, liabilityToAsset };
}

export const mk = (d: number, c: number) => +(d - c).toFixed(2);
export const mkC = (d: number, c: number) => +(c - d).toFixed(2);
