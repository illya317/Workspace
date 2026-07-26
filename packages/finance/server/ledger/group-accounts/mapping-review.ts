export type GroupMappingReviewClass =
  | "confirmed"
  | "reviewed"
  | "pending_review";

export interface GroupMappingReviewCandidate {
  id: number;
  code: string;
  name: string;
  category: string;
  balanceDirection: string;
  sourceKind: "reference_seed" | "suggested" | "manual";
}

export interface GroupMappingReviewInput {
  localAccountCode: string;
  localAccountName: string;
  localCategory: string;
  localBalanceDirection: string;
  mappingMethod: string;
  currentGroupAccount: GroupMappingReviewCandidate | null;
  candidates: readonly GroupMappingReviewCandidate[];
}

export interface GroupMappingReviewResult {
  reviewClass: GroupMappingReviewClass;
  reviewReason: string;
  needsReview: boolean;
  suggestions: Array<GroupMappingReviewCandidate & { score: number }>;
}

/**
 * Turns mapping provenance into an explainable review diagnosis. The scorer only
 * proposes candidates with compatible accounting attributes; it never mutates a mapping.
 */
export function diagnoseGroupAccountMapping(input: GroupMappingReviewInput): GroupMappingReviewResult {
  const current = input.currentGroupAccount;
  if (!current) {
    const suggestions = rankSuggestions(input);
    return suggestions.length > 0
      ? diagnosis("pending_review", "系统已给出同类别、同余额方向的候选集团科目", true, suggestions)
      : diagnosis("pending_review", "尚未指定集团科目", true, []);
  }
  const attributesMatch = hasCompatibleAttributes(input, current);
  const namesMatch = normalizeAccountName(input.localAccountName) === normalizeAccountName(current.name);

  if ((input.mappingMethod === "manual_override" || input.mappingMethod === "hierarchy_match") && attributesMatch) {
    return diagnosis("reviewed", "已由财务人员按集团科目口径复核", false, []);
  }
  if (input.localAccountCode === current.code && namesMatch && attributesMatch) {
    return diagnosis("confirmed", "科目编码、名称、类别和余额方向一致", false, []);
  }

  const suggestions = rankSuggestions(input);
  if (input.localAccountCode === current.code && namesMatch) {
    return suggestions.length > 0
      ? diagnosis("pending_review", "当前映射属性不一致，系统已给出同类候选", true, suggestions)
      : diagnosis("pending_review", "当前映射属性不一致，且没有可靠候选", true, []);
  }
  if (suggestions.length > 0) {
    return diagnosis("pending_review", "系统已给出同类别、同余额方向的候选集团科目", true, suggestions);
  }
  if (attributesMatch) {
    return diagnosis("pending_review", "当前映射由系统给出，等待财务人员复核", true, []);
  }
  return diagnosis("pending_review", "当前映射需要财务人员复核", true, []);
}

function diagnosis(
  reviewClass: GroupMappingReviewClass,
  reviewReason: string,
  needsReview: boolean,
  suggestions: GroupMappingReviewResult["suggestions"],
): GroupMappingReviewResult {
  return { reviewClass, reviewReason, needsReview, suggestions };
}

function rankSuggestions(input: GroupMappingReviewInput) {
  return input.candidates
    .filter((candidate) => candidate.id !== input.currentGroupAccount?.id && hasCompatibleAttributes(input, candidate))
    .flatMap((candidate) => {
      const nameScore = accountNameSimilarity(input.localAccountName, candidate.name);
      const codeScore = codeAffinity(input.localAccountCode, candidate.code);
      const eligible = nameScore >= 0.98 || (nameScore >= 0.72 && codeScore >= 0.5);
      if (!eligible) return [];
      const score = roundScore(nameScore * 0.7 + codeScore * 0.25 + (candidate.sourceKind === "reference_seed" ? 0.05 : 0));
      return [{ ...candidate, score }];
    })
    .sort((left, right) => right.score - left.score
      || Number(right.sourceKind === "reference_seed") - Number(left.sourceKind === "reference_seed")
      || compareCodes(left.code, right.code))
    .slice(0, 3);
}

function hasCompatibleAttributes(
  input: Pick<GroupMappingReviewInput, "localCategory" | "localBalanceDirection">,
  candidate: Pick<GroupMappingReviewCandidate, "category" | "balanceDirection">,
) {
  return input.localCategory === candidate.category
    && input.localBalanceDirection === candidate.balanceDirection;
}

export function normalizeAccountName(value: string) {
  return value.normalize("NFKC")
    .toLowerCase()
    .replaceAll("住房公积金", "公积金")
    .replace(/社会保险费|社会保险|社保费/g, "社保")
    .replace(/办公费用/g, "办公费")
    .replace(/交通费用/g, "交通费")
    .replace(/[\s·•,，、.。()（）()\-_/％%]/g, "");
}

export function accountNameSimilarity(left: string, right: string) {
  const normalizedLeft = normalizeAccountName(left);
  const normalizedRight = normalizeAccountName(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return Math.min(normalizedLeft.length, normalizedRight.length) / Math.max(normalizedLeft.length, normalizedRight.length);
  }
  const leftPairs = characterPairs(normalizedLeft);
  const rightPairs = characterPairs(normalizedRight);
  if (leftPairs.length === 0 || rightPairs.length === 0) return 0;
  const rightCounts = new Map<string, number>();
  for (const pair of rightPairs) rightCounts.set(pair, (rightCounts.get(pair) ?? 0) + 1);
  let intersection = 0;
  for (const pair of leftPairs) {
    const remaining = rightCounts.get(pair) ?? 0;
    if (remaining === 0) continue;
    intersection += 1;
    rightCounts.set(pair, remaining - 1);
  }
  return (2 * intersection) / (leftPairs.length + rightPairs.length);
}

export function codeAffinity(left: string, right: string) {
  if (left === right) return 1;
  const prefix = commonPrefixLength(left, right);
  if (prefix >= 6) return 0.98;
  if (prefix >= 4) return 0.92;
  if (prefix >= 3) return 0.82;
  if (prefix >= 2) return 0.68;
  if (prefix >= 1) return 0.5;
  return 0;
}

function characterPairs(value: string) {
  if (value.length < 2) return [value];
  return Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2));
}

function commonPrefixLength(left: string, right: string) {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

function compareCodes(left: string, right: string) {
  return left.localeCompare(right, "zh-CN", { numeric: true });
}

function roundScore(value: number) {
  return Math.round(value * 1000) / 1000;
}
