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
 * Reclassification routing: two maps for source deductions and target additions.
 *
 * deductions: keyed by sourceAccount → amounts to REMOVE from the source line
 *   - asset source: credit amount to deduct
 *   - liability source: debit amount to deduct
 *
 * additions: keyed by targetAccount → amounts to ADD to the target line
 *   - asset→liability: credit amount to add
 *   - liability→asset: debit amount to add
 */
export interface ReclassRouting {
  /** By sourceAccount: amounts to DEDUCT from each source line */
  deductions: Map<string, { debit: number; credit: number }>;
  /** By targetAccount: amounts to ADD to each target line */
  additions: Map<string, { debit: number; credit: number }>;
}

/**
 * Compute reclassification pools from approved ReclassResult entries.
 * Each entry's `amount` is routed to the entry's `targetAccount`.
 *
 * Classification by sourceAccount prefix:
 *   1xxx (asset)   → amount added as credit to targetAccount pool
 *   2xxx (liability)→ amount added as debit  to targetAccount pool
 */
export function reclassifyFromEntries(entries: ReclassEntry[]): ReclassRouting {
  const deductions = new Map<string, { debit: number; credit: number }>();
  const additions = new Map<string, { debit: number; credit: number }>();

  for (const e of entries) {
    // Source-side deduction
    const src = deductions.get(e.sourceAccount) || { debit: 0, credit: 0 };
    if (e.sourceAccount.startsWith("1")) {
      src.credit += e.amount; // deduct credit from asset line
    } else if (e.sourceAccount.startsWith("2")) {
      src.debit += e.amount;  // deduct debit from liability line
    }
    deductions.set(e.sourceAccount, src);

    // Target-side addition
    const tgt = additions.get(e.targetAccount) || { debit: 0, credit: 0 };
    if (e.sourceAccount.startsWith("1")) {
      tgt.credit += e.amount; // add credit to target liability line
    } else if (e.sourceAccount.startsWith("2")) {
      tgt.debit += e.amount;  // add debit to target asset line
    }
    additions.set(e.targetAccount, tgt);
  }
  return { deductions, additions };
}

/**
 * Legacy balance-level reclassification.
 * Deductions aggregated per source account, additions to hardcoded targets:
 *   asset→liability  → "2241" (其他应付款)
 *   liability→asset  → "1463" (其他流动资产)
 */
export function reclassify(balances: BalanceItem[]): ReclassRouting {
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

  const deductions = new Map<string, { debit: number; credit: number }>();
  let alDebit = 0, alCredit = 0;
  let laDebit = 0, laCredit = 0;

  for (const b of balances) {
    if (!leafCodes.has(b.account.code)) continue;
    const net = b.closingDebit - b.closingCredit;
    if (b.account.code.startsWith("1") && net < 0) {
      // Asset → Liability: deduct from source account
      const cur = deductions.get(b.account.code) || { debit: 0, credit: 0 };
      cur.debit += b.closingDebit;
      cur.credit += b.closingCredit;
      deductions.set(b.account.code, cur);
      alDebit += b.closingDebit;
      alCredit += b.closingCredit;
    }
    if (b.account.code.startsWith("2") && net > 0) {
      // Liability → Asset: deduct from source account
      const cur = deductions.get(b.account.code) || { debit: 0, credit: 0 };
      cur.debit += b.closingDebit;
      cur.credit += b.closingCredit;
      deductions.set(b.account.code, cur);
      laDebit += b.closingDebit;
      laCredit += b.closingCredit;
    }
  }

  const additions = new Map<string, { debit: number; credit: number }>();
  if (alDebit > 0 || alCredit > 0) {
    additions.set("2241", { debit: alDebit, credit: alCredit });
  }
  if (laDebit > 0 || laCredit > 0) {
    additions.set("1463", { debit: laDebit, credit: laCredit });
  }

  return { deductions, additions };
}

export const mk = (d: number, c: number) => +(d - c).toFixed(2);
export const mkC = (d: number, c: number) => +(c - d).toFixed(2);
