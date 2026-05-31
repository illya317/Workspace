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

// ─── Phase 7: ReclassResult-based reclassification ─────────

/** A single approved/adjusted reclassification entry from ReclassResult. */
export interface ReclassEntry {
  sourceAccount: string;
  targetAccount: string;
  amount: number;
}

/**
 * Reclassification pools: amounts to ADD to each target account line.
 * Key = targetAccount code (or legacy bucket code).
 *
 * Asset→liability reclass: amount is a credit → added to target's credit.
 * Liability→asset reclass:  amount is a debit  → added to target's debit.
 *
 * Deduction from source lines is handled by the caller aggregating
 * totals per source prefix (1xxx / 2xxx).
 */
export type ReclassPools = Map<string, { debit: number; credit: number }>;

/**
 * Compute reclassification pools from approved ReclassResult entries.
 * Each entry's `amount` is routed to the entry's `targetAccount`.
 *
 * Classification by sourceAccount prefix:
 *   1xxx (asset)   → amount added as credit to targetAccount pool
 *   2xxx (liability)→ amount added as debit  to targetAccount pool
 */
export function reclassifyFromEntries(entries: ReclassEntry[]): ReclassPools {
  const pools: ReclassPools = new Map();

  for (const e of entries) {
    const cur = pools.get(e.targetAccount) || { debit: 0, credit: 0 };
    if (e.sourceAccount.startsWith("1")) {
      cur.credit += e.amount;
    } else if (e.sourceAccount.startsWith("2")) {
      cur.debit += e.amount;
    }
    pools.set(e.targetAccount, cur);
  }
  return pools;
}

/**
 * Legacy balance-level reclassification.
 * Returns pools under hardcoded target keys:
 *   asset→liability  → "2241" (其他应付款)
 *   liability→asset  → "1463" (其他流动资产)
 */
export function reclassify(balances: BalanceItem[]): ReclassPools {
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

  const pools: ReclassPools = new Map();
  if (assetToLiability.debit > 0 || assetToLiability.credit > 0) {
    pools.set("2241", assetToLiability);
  }
  if (liabilityToAsset.debit > 0 || liabilityToAsset.credit > 0) {
    pools.set("1463", liabilityToAsset);
  }
  return pools;
}

export const mk = (d: number, c: number) => +(d - c).toFixed(2);
export const mkC = (d: number, c: number) => +(c - d).toFixed(2);
