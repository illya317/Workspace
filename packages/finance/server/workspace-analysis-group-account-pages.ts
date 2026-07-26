import "server-only";

import { WorkspaceAnalysisRuntimeError } from "@workspace/platform/server/workspace-analysis-runtime";

import type { FinanceGroupAccountReviewStatus } from "@workspace/finance/types";
import { listFinanceGroupAccounts } from "./ledger/group-accounts";
import type {
  FinanceGroupAccountParentRecommendationRow,
  FinanceGroupAccountParentRow,
  FinanceGroupAccountYearRow,
} from "./workspace-analysis-child-sources";

const SOURCE_KEYS = new Set([
  "finance.ledger.group-account-years",
  "finance.ledger.group-account-parents",
  "finance.ledger.group-account-parent-recommendations",
]);
const MAX_ROWS = 4_000;

export function isFinanceGroupAccountChildWorkspaceAnalysisSource(sourceKey: string) {
  return SOURCE_KEYS.has(sourceKey);
}

export async function loadFinanceGroupAccountChildWorkspaceAnalysisSourcePage(input: {
  sourceKey: string;
  parameters: Readonly<Record<string, string | number | boolean>>;
  page: number;
  pageSize: number;
}) {
  const { sourceKey, parameters, page, pageSize } = input;
  const catalog = await listFinanceGroupAccounts({
    policyVersionId: integer(parameters.policyVersionId),
    keyword: text(parameters.keyword),
    category: text(parameters.category),
    reviewStatus: reviewStatus(parameters.reviewStatus),
  });
  assertBounded(sourceKey, catalog.rows.length);

  if (sourceKey === "finance.ledger.group-account-years") {
    return pageRows(sourceKey, catalog.rows.flatMap((row) => row.years.map((value): FinanceGroupAccountYearRow => ({
      groupAccountId: row.id, accountCode: row.code, year: value,
    }))), page, pageSize);
  }
  if (sourceKey === "finance.ledger.group-account-parents") {
    return pageRows(sourceKey, catalog.rows.flatMap((row): FinanceGroupAccountParentRow[] => row.parent ? [{
      groupAccountId: row.id, accountCode: row.code, accountName: row.name,
      parentGroupAccountId: row.parent.id, parentGroupAccountCode: row.parent.code, parentGroupAccountName: row.parent.name,
    }] : []), page, pageSize);
  }
  const rows = catalog.rows.flatMap((row): FinanceGroupAccountParentRecommendationRow[] => {
    const recommendation = row.parentRecommendation;
    if (!recommendation) return [];
    return [{
      groupAccountId: row.id,
      accountCode: row.code,
      kind: recommendation.kind,
      localParentCode: recommendation.kind === "mapped" || recommendation.kind === "unresolved" ? recommendation.localParent.code : null,
      localParentName: recommendation.kind === "mapped" || recommendation.kind === "unresolved" ? recommendation.localParent.name : null,
      suggestedParentGroupAccountId: recommendation.kind === "mapped" ? recommendation.groupAccount.id : null,
      suggestedParentCode: recommendation.kind === "mapped" ? recommendation.groupAccount.code : null,
      suggestedParentName: recommendation.kind === "mapped" ? recommendation.groupAccount.name : null,
    }];
  });
  return pageRows(sourceKey, rows, page, pageSize);
}

function pageRows(sourceKey: string, rows: readonly unknown[], page: number, pageSize: number) {
  assertBounded(sourceKey, rows.length);
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), totalRows: rows.length };
}

function assertBounded(sourceKey: string, count: number) {
  if (count > MAX_ROWS) {
    throw new WorkspaceAnalysisRuntimeError("source_limit_exceeded", `规范化行数 ${count} 超过上限 ${MAX_ROWS}`, sourceKey);
  }
}

function text(value: string | number | boolean | undefined) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function integer(value: string | number | boolean | undefined) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function reviewStatus(value: string | number | boolean | undefined): FinanceGroupAccountReviewStatus | undefined {
  return value === "confirmed" || value === "reviewed" || value === "pending_review" || value === "pending_delete" ? value : undefined;
}
