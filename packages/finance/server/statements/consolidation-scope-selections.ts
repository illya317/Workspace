import type { StatementPeriodKind } from "@workspace/finance/types/statement-period";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { prisma } from "@workspace/platform/server/prisma";

import {
  buildSaveFinanceConsolidationScopeSelectionCommand,
  type SaveFinanceConsolidationScopeSelectionCommand,
} from "../domain/consolidation-scope-selection-validation";
import {
  ConsolidationSnapshotError,
  loadConsolidationCandidateFacts,
  loadConsolidationScopeFactsWithOverrides,
  periodEndDate,
  type ConsolidationScopeFact,
} from "./consolidation-snapshots";

interface ConsolidationScopeSelectionKey {
  parentCompanyId: number;
  year: number;
  month: number;
  periodKind: StatementPeriodKind;
}

function selectionWhere(key: ConsolidationScopeSelectionKey) {
  return {
    parentCompanyId: key.parentCompanyId,
    year: key.year,
    month: key.month,
    periodKind: key.periodKind,
  };
}

function selectionMatchesCandidate(
  selection: { relationId: number; relationVersion: number },
  candidate: ConsolidationScopeFact,
) {
  return selection.relationId === candidate.relationId
    && selection.relationVersion === candidate.relationVersion;
}

export async function loadFinanceConsolidationScope(
  key: ConsolidationScopeSelectionKey,
  asOfDate: string,
) {
  const candidates = await loadConsolidationCandidateFacts(key.parentCompanyId, asOfDate);
  const selections = await prisma.financeConsolidationScopeSelection.findMany({
    where: selectionWhere(key),
    select: { companyId: true, relationId: true, relationVersion: true, included: true },
  });
  const selectionByCompanyId = new Map(selections.map((selection) => [selection.companyId, selection]));
  const inclusionByCompanyId = new Map<number, boolean>();
  const selectedCandidates = candidates.map((candidate) => {
    if (candidate.role === "parent") return candidate;
    const selection = selectionByCompanyId.get(candidate.companyId);
    if (!selection || !selectionMatchesCandidate(selection, candidate)) return candidate;
    inclusionByCompanyId.set(candidate.companyId, selection.included);
    return { ...candidate, isConsolidated: selection.included };
  });
  const scope = await loadConsolidationScopeFactsWithOverrides(
    key.parentCompanyId,
    asOfDate,
    inclusionByCompanyId,
  );
  return { candidates: selectedCandidates, scope };
}

function affectedCandidates(
  candidates: ConsolidationScopeFact[],
  target: ConsolidationScopeFact,
  included: boolean,
) {
  const affectedIds = new Set([target.companyId]);
  if (included) {
    const byCompanyId = new Map(candidates.map((candidate) => [candidate.companyId, candidate]));
    let parentId = target.directParentCompanyId;
    while (parentId) {
      const parent = byCompanyId.get(parentId);
      if (!parent || parent.role === "parent") break;
      affectedIds.add(parent.companyId);
      parentId = parent.directParentCompanyId;
    }
  } else {
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of candidates) {
        if (candidate.directParentCompanyId && affectedIds.has(candidate.directParentCompanyId)
          && !affectedIds.has(candidate.companyId)) {
          affectedIds.add(candidate.companyId);
          changed = true;
        }
      }
    }
  }
  return candidates.filter((candidate) => candidate.role === "subsidiary" && affectedIds.has(candidate.companyId));
}

export async function saveFinanceConsolidationScopeSelection(
  rawCommand: SaveFinanceConsolidationScopeSelectionCommand,
) {
  const validation = buildSaveFinanceConsolidationScopeSelectionCommand(rawCommand.input, rawCommand.userId);
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "finance.statements.consolidationScope.save",
    actorUserId: command.userId,
    resourceKey: "finance.statements",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "本次合并报表范围已配置为必须走流程，请从统一保存入口提交",
  });
  if (!direct.ok) return direct;
  const input = command.input;
  const asOfDate = periodEndDate(input.year, input.month);
  try {
    const existingBatch = await prisma.financeConsolidationBatch.findFirst({
      where: selectionWhere(input),
      select: { id: true },
    });
    if (existingBatch) return serviceError("本次合并报表已生成批次，范围不能再修改", 409);
    const candidates = await loadConsolidationCandidateFacts(input.parentCompanyId, asOfDate);
    const target = candidates.find((candidate) => candidate.companyId === input.companyId);
    if (!target || target.role !== "subsidiary" || target.relationId !== input.relationId) {
      return serviceError("当前公司已不在该母公司的合并候选范围内，请刷新后重试", 409);
    }
    if (target.relationVersion !== input.expectedRelationVersion) {
      return serviceError("公司关系已更新，请刷新后重试", 409);
    }
    const affected = affectedCandidates(candidates, target, input.included);
    await prisma.$transaction(affected.map((candidate) => prisma.financeConsolidationScopeSelection.upsert({
      where: {
        parentCompanyId_year_month_periodKind_companyId: {
          parentCompanyId: input.parentCompanyId,
          year: input.year,
          month: input.month,
          periodKind: input.periodKind,
          companyId: candidate.companyId,
        },
      },
      create: {
        parentCompanyId: input.parentCompanyId,
        year: input.year,
        month: input.month,
        periodKind: input.periodKind,
        companyId: candidate.companyId,
        relationId: candidate.relationId!,
        relationVersion: candidate.relationVersion!,
        included: input.included,
        selectedBy: command.userId,
      },
      update: {
        relationId: candidate.relationId!,
        relationVersion: candidate.relationVersion!,
        included: input.included,
        selectedBy: command.userId,
      },
    })));
    return serviceOk({
      included: input.included,
      companyIds: affected.map((candidate) => candidate.companyId),
    });
  } catch (cause) {
    if (cause instanceof ConsolidationSnapshotError) return serviceError(cause.message, cause.status);
    throw cause;
  }
}
