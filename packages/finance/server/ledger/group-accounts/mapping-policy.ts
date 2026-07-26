export type FinanceGroupMappingMethod =
  | "unmatched"
  | "reference_seed"
  | "exact_code_name"
  | "exact_name"
  | "suggested";

export interface GroupAccountCandidate {
  id: number;
  code: string;
  name: string;
  category: string;
  balanceDirection: string;
  sourceKind?: string;
}

export type GroupMappingDecision =
  | { kind: "existing"; groupAccountId: number; method: "exact_code_name" | "exact_name" | "suggested" }
  | { kind: "unmatched" };

export function decideGroupAccountMapping(
  localAccount: { code: string; name: string; category: string; balanceDirection: string },
  groupAccounts: readonly GroupAccountCandidate[],
): GroupMappingDecision {
  const sameCode = groupAccounts.find((account) => account.code === localAccount.code);
  const compatibleAccounts = groupAccounts.filter((account) => hasSameAccountingAttributes(localAccount, account));
  if (sameCode?.name === localAccount.name && hasSameAccountingAttributes(localAccount, sameCode)) {
    return { kind: "existing", groupAccountId: sameCode.id, method: "exact_code_name" };
  }

  const normalizedLocalName = normalizeMappingAccountName(localAccount.name);
  const sameFamily = compatibleAccounts.filter((account) => codeFamily(account.code) === codeFamily(localAccount.code));
  const sameName = compatibleAccounts.filter((account) => (
    account.sourceKind === "suggested" || codeFamily(account.code) === codeFamily(localAccount.code)
  ) && normalizeMappingAccountName(account.name) === normalizedLocalName);
  if (sameName.length === 1) {
    return { kind: "existing", groupAccountId: sameName[0].id, method: "exact_name" };
  }

  const ranked = sameFamily.flatMap((account) => {
    const nameScore = accountNameSimilarity(normalizedLocalName, normalizeMappingAccountName(account.name));
    const codeScore = codeAffinity(localAccount.code, account.code);
    if (nameScore < 0.72 || codeScore < 0.68) return [];
    return [{ account, score: nameScore * 0.75 + codeScore * 0.25 }];
  }).sort((left, right) => right.score - left.score || compareAccountCodes(left.account.code, right.account.code));
  if (ranked[0] && (!ranked[1] || ranked[0].score - ranked[1].score >= 0.08)) {
    return { kind: "existing", groupAccountId: ranked[0].account.id, method: "suggested" };
  }

  return { kind: "unmatched" };
}

export function normalizeMappingAccountName(value: string) {
  return value.normalize("NFKC")
    .toLowerCase()
    .replaceAll("住房公积金", "公积金")
    .replace(/社会保险费|社会保险|社保费/g, "社保")
    .replace(/办公费用/g, "办公费")
    .replace(/交通费用/g, "交通费")
    .replace(/[\s·•,，、.。()（）\-_/％%]/g, "");
}

export function codeFamily(code: string) {
  return code.slice(0, 4);
}

function accountNameSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  }
  const leftChars = new Set(left);
  const rightChars = new Set(right);
  const overlap = [...leftChars].filter((char) => rightChars.has(char)).length;
  return overlap / Math.max(leftChars.size, rightChars.size);
}

function codeAffinity(left: string, right: string) {
  const limit = Math.min(left.length, right.length);
  let prefix = 0;
  while (prefix < limit && left[prefix] === right[prefix]) prefix += 1;
  if (prefix >= 4) return 1;
  if (prefix === 3) return 0.82;
  if (prefix === 2) return 0.68;
  return prefix === 1 ? 0.5 : 0;
}

function hasSameAccountingAttributes(
  left: Pick<GroupAccountCandidate, "category" | "balanceDirection">,
  right: Pick<GroupAccountCandidate, "category" | "balanceDirection">,
) {
  return left.category === right.category && left.balanceDirection === right.balanceDirection;
}

export function compareAccountCodes(left: string, right: string) {
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
    const numeric = BigInt(left) - BigInt(right);
    if (numeric < 0n) return -1;
    if (numeric > 0n) return 1;
  }
  return left.localeCompare(right, "zh-CN", { numeric: true });
}
