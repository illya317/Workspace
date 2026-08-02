import { serviceError, serviceOk } from "@workspace/platform/service-result";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { Prisma, prisma } from "@workspace/platform/server/prisma";

import type { FinanceConsolidationRuleResponse } from "@workspace/finance/types";
import {
  buildSaveFinanceConsolidationRuleCommand,
  type SaveFinanceConsolidationRuleCommandInput,
} from "../domain/consolidation-rule-validation";

export async function listFinanceConsolidationRules(input: { policyVersionId?: number } = {}): Promise<FinanceConsolidationRuleResponse> {
  const versions = await prisma.financeAccountingPolicyVersion.findMany({ orderBy: { versionNo: "desc" } });
  const current = versions.find((version) => version.status === "published" && version.effectiveTo === null);
  if (!current) throw new Error("缺少当前生效的集团会计政策版本");
  const selected = input.policyVersionId ? versions.find((version) => version.id === input.policyVersionId) : current;
  if (!selected) throw new Error("集团会计政策版本不存在");
  const rules = await prisma.financeConsolidationRule.findMany({
    where: { policyVersionId: selected.id },
    include: {
      selectors: {
        orderBy: [{ side: "asc" }, { sequence: "asc" }],
        include: { groupAccount: { select: { id: true, code: true, name: true } } },
      },
    },
    orderBy: [{ priority: "asc" }, { ruleCode: "asc" }],
  });
  const accountRevisions = await prisma.financeGroupAccountRevision.findMany({
    where: {
      policyVersionId: selected.id,
      isActive: true,
      reviewStatus: { not: "pending_delete" },
    },
    select: {
      groupAccountId: true,
      code: true,
      name: true,
      consolidationRole: true,
      counterpartyRequirement: true,
      movementType: true,
      translationRateType: true,
      parentGroupAccountId: true,
    },
    orderBy: { code: "asc" },
  });
  const accountById = new Map(accountRevisions.map((revision) => [revision.groupAccountId, revision]));
  const accountsByRole = new Map<string, typeof accountRevisions>();
  for (const revision of accountRevisions) {
    const rows = accountsByRole.get(revision.consolidationRole) ?? [];
    rows.push(revision);
    accountsByRole.set(revision.consolidationRole, rows);
  }
  const childrenByParentId = new Map<number, typeof accountRevisions>();
  for (const revision of accountRevisions) {
    if (revision.parentGroupAccountId === null) continue;
    const rows = childrenByParentId.get(revision.parentGroupAccountId) ?? [];
    rows.push(revision);
    childrenByParentId.set(revision.parentGroupAccountId, rows);
  }
  const resolvedAccounts = (selector: (typeof rules)[number]["selectors"][number]) => {
    if (selector.selectorType === "role" && selector.consolidationRole) {
      return accountsByRole.get(selector.consolidationRole) ?? [];
    }
    if (selector.selectorType !== "groupAccount" || selector.groupAccountId === null) return [];
    const root = accountById.get(selector.groupAccountId);
    if (!root) return [];
    if (!selector.includeChildren) return [root];
    const result = [root];
    const pending = [root.groupAccountId];
    const visited = new Set(pending);
    while (pending.length > 0) {
      const parentId = pending.shift()!;
      for (const child of childrenByParentId.get(parentId) ?? []) {
        if (visited.has(child.groupAccountId)) continue;
        visited.add(child.groupAccountId);
        result.push(child);
        pending.push(child.groupAccountId);
      }
    }
    return result;
  };
  return {
    currentPolicyVersionId: current.id,
    selectedPolicyVersionId: selected.id,
    policyVersions: versions.map((version) => ({
      id: version.id,
      versionNo: version.versionNo,
      code: version.code,
      name: version.name,
      effectiveFrom: version.effectiveFrom?.toISOString().slice(0, 10) ?? null,
      effectiveTo: version.effectiveTo?.toISOString().slice(0, 10) ?? null,
      status: version.status,
      createdAt: version.createdAt.toISOString(),
    })),
    rows: rules.map((rule) => ({
      id: rule.id,
      policyVersionId: rule.policyVersionId,
      ruleCode: rule.ruleCode,
      name: rule.name,
      ruleType: rule.ruleType as FinanceConsolidationRuleResponse["rows"][number]["ruleType"],
      dataBasis: rule.dataBasis as FinanceConsolidationRuleResponse["rows"][number]["dataBasis"],
      matchMode: rule.matchMode as FinanceConsolidationRuleResponse["rows"][number]["matchMode"],
      amountMode: rule.amountMode as FinanceConsolidationRuleResponse["rows"][number]["amountMode"],
      postingSide: rule.postingSide as FinanceConsolidationRuleResponse["rows"][number]["postingSide"],
      differenceHandling: rule.differenceHandling as FinanceConsolidationRuleResponse["rows"][number]["differenceHandling"],
      toleranceAmount: Number(rule.toleranceAmount),
      currencyRateType: rule.currencyRateType as FinanceConsolidationRuleResponse["rows"][number]["currencyRateType"],
      enabled: rule.enabled,
      priority: rule.priority,
      sourceKind: rule.sourceKind as FinanceConsolidationRuleResponse["rows"][number]["sourceKind"],
      note: rule.note,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
      selectors: rule.selectors.map((selector) => ({
        id: selector.id,
        side: selector.side as "left" | "right" | "difference",
        sequence: selector.sequence,
        selectorType: selector.selectorType as "role" | "groupAccount",
        consolidationRole: selector.consolidationRole as FinanceConsolidationRuleResponse["rows"][number]["selectors"][number]["consolidationRole"],
        groupAccountId: selector.groupAccountId,
        groupAccount: selector.groupAccount,
        includeChildren: selector.includeChildren,
        resolvedGroupAccounts: resolvedAccounts(selector).map((account) => ({
          id: account.groupAccountId,
          code: account.code,
          name: account.name,
          consolidationRole: account.consolidationRole as FinanceConsolidationRuleResponse["rows"][number]["selectors"][number]["resolvedGroupAccounts"][number]["consolidationRole"],
          counterpartyRequirement: account.counterpartyRequirement as FinanceConsolidationRuleResponse["rows"][number]["selectors"][number]["resolvedGroupAccounts"][number]["counterpartyRequirement"],
          movementType: account.movementType as FinanceConsolidationRuleResponse["rows"][number]["selectors"][number]["resolvedGroupAccounts"][number]["movementType"],
          translationRateType: account.translationRateType as FinanceConsolidationRuleResponse["rows"][number]["selectors"][number]["resolvedGroupAccounts"][number]["translationRateType"],
        })),
      })),
    })),
  };
}

export async function saveFinanceConsolidationRule(raw: SaveFinanceConsolidationRuleCommandInput) {
  const command = buildSaveFinanceConsolidationRuleCommand(raw);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  const data = command.data.input;
  const actionKey = data.ruleId ? "finance.ledger.consolidationRule.update" : "finance.ledger.consolidationRule.create";
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: actionKey,
    actorUserId: data.userId,
    resourceKey: "finance.ledger",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "合并规则维护已配置为必须走流程，请从统一保存入口提交",
  });
  if (!direct.ok) return direct;
  const current = await prisma.financeAccountingPolicyVersion.findFirst({
    where: { status: "published", effectiveTo: null },
    select: { id: true },
  });
  if (!current) return serviceError("缺少当前生效的集团会计政策版本", 409);
  const existing = data.ruleId ? await prisma.financeConsolidationRule.findUnique({ where: { id: data.ruleId } }) : null;
  if (data.ruleId && (!existing || existing.policyVersionId !== current.id)) return serviceError("合并规则不存在或历史版本只读", 404);
  if (existing && data.expectedUpdatedAt !== existing.updatedAt.toISOString()) {
    return serviceError("合并规则已被其他操作修改，请刷新后重试", 409);
  }
  const differenceAccount = data.differenceGroupAccountId === null ? null : await prisma.financeGroupAccountRevision.findUnique({
    where: { policyVersionId_groupAccountId: { policyVersionId: current.id, groupAccountId: data.differenceGroupAccountId } },
    select: { isActive: true, reviewStatus: true },
  });
  if (data.differenceGroupAccountId !== null && (!differenceAccount?.isActive || differenceAccount.reviewStatus === "pending_delete")) {
    return serviceError("差额集团科目不存在、未启用或待删除", 400);
  }
  const selectors = [
    ...data.leftRoles.map((role, index) => ({ side: "left", sequence: index + 1, selectorType: "role", consolidationRole: role, groupAccountId: null, includeChildren: true })),
    ...data.rightRoles.map((role, index) => ({ side: "right", sequence: index + 1, selectorType: "role", consolidationRole: role, groupAccountId: null, includeChildren: true })),
    ...(data.differenceGroupAccountId === null ? [] : [{ side: "difference", sequence: 1, selectorType: "groupAccount", consolidationRole: null, groupAccountId: data.differenceGroupAccountId, includeChildren: false }]),
  ];
  try {
    const rule = await prisma.$transaction(async (tx) => {
      const payload = {
        ruleCode: data.ruleCode,
        name: data.name,
        ruleType: data.ruleType,
        dataBasis: data.dataBasis,
        matchMode: data.matchMode,
        amountMode: data.amountMode,
        postingSide: data.postingSide,
        differenceHandling: data.differenceHandling,
        toleranceAmount: data.toleranceAmount,
        currencyRateType: data.currencyRateType,
        enabled: data.enabled,
        priority: data.priority,
        note: data.note,
        updatedBy: data.userId,
      };
      if (existing) {
        await tx.financeConsolidationRuleSelector.deleteMany({ where: { ruleId: existing.id } });
        return tx.financeConsolidationRule.update({
          where: { id: existing.id },
          data: { ...payload, selectors: { create: selectors } },
        });
      }
      return tx.financeConsolidationRule.create({
        data: {
          policyVersionId: current.id,
          ...payload,
          sourceKind: "manual",
          createdBy: data.userId,
          selectors: { create: selectors },
        },
      });
    });
    return serviceOk({ success: true, ruleId: rule.id });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return serviceError("当前政策版本已存在该规则编码", 409);
    }
    throw error;
  }
}
