"use client";

import { workspacePath } from "@workspace/core/routing";
import { createFieldsSection, createStatusSection } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, FormSurfaceFieldSpec } from "@workspace/core/ui";
import type { FinanceGroupAccountCatalogRow, ScanCandidatesResult } from "@workspace/finance/types";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  reclassRuleDraftFromCandidate,
  reclassRuleFormItems,
  reclassRuleReadOnlyItems,
  sameReclassRuleDraft,
  type ReclassRuleFormDraft,
} from "./reclassRulePresentation";

export function useGroupAccountReclassRule(input: {
  policyVersionId: number | null;
  selectedId: number | null;
  canRevise: boolean;
}) {
  const [data, setData] = useState<ScanCandidatesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<ReclassRuleFormDraft | null>(null);
  const candidate = useMemo(
    () => data?.candidates.find((row) => row.groupAccountId === input.selectedId) ?? null,
    [data, input.selectedId],
  );
  const dirty = Boolean(candidate && draft
    && !sameReclassRuleDraft(draft, reclassRuleDraftFromCandidate(candidate)));
  const targetOptions = useMemo(() => (data?.accountOptions ?? []).map((account) => ({
    value: String(account.id),
    label: `${account.code} ${account.name}`,
    searchText: account.name,
  })), [data?.accountOptions]);
  const canEdit = input.canRevise && Boolean(candidate && !candidate.inheritedFromAccountCode);

  const reload = useCallback(async () => {
    if (!input.policyVersionId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ policyVersionId: String(input.policyVersionId) });
      const response = await fetch(workspacePath(`/api/modules/finance/ledger/reclass-rules?${query.toString()}`));
      if (!response.ok) throw new Error("重分类规则加载失败");
      setData(await response.json() as ScanCandidatesResult);
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : "重分类规则加载失败");
    } finally {
      setLoading(false);
    }
  }, [input.policyVersionId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    setDraft(candidate ? reclassRuleDraftFromCandidate(candidate) : null);
  }, [candidate]);

  const updateDraft = useCallback((change: Partial<ReclassRuleFormDraft>) => {
    setDraft((current) => current ? { ...current, ...change } : current);
  }, []);

  const save = useCallback(async () => {
    if (!dirty || !candidate || !draft || !input.policyVersionId) return;
    const response = await fetch(workspacePath("/api/modules/finance/ledger/reclass-rules"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policyVersionId: input.policyVersionId,
        changes: [{
          sourceGroupAccountId: candidate.groupAccountId,
          abnormalSide: candidate.abnormalSide,
          targetGroupAccountId: draft.decision === "reclassify" ? draft.targetGroupAccountId : null,
          basis: draft.basis,
        }],
      }),
    });
    const result = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) throw new Error(result?.error || "重分类规则保存失败");
  }, [candidate, dirty, draft, input.policyVersionId]);

  return { candidate, draft, dirty, loading, error, canEdit, targetOptions, updateDraft, reload, save };
}

export type GroupAccountReclassRuleController = ReturnType<typeof useGroupAccountReclassRule>;

export function groupAccountReclassSections(input: {
  selected: FinanceGroupAccountCatalogRow;
  controller: GroupAccountReclassRuleController;
}): BodySurfaceSectionSpec[] {
  const { candidate, draft, loading, error, canEdit, dirty, targetOptions, updateDraft } = input.controller;
  if (loading) {
    return [createStatusSection("group-account-reclass-loading", { kind: "loading", content: "加载重分类规则..." })];
  }
  if (error) {
    return [createStatusSection("group-account-reclass-error", { kind: "error", content: error })];
  }
  if (!candidate || !draft) return [];
  const targetLabel = candidate.existingTargetGroupAccountId === null
    ? null
    : targetOptions.find((option) => option.value === String(candidate.existingTargetGroupAccountId))?.label ?? null;
  const fields = canEdit
    ? reclassRuleFormItems({ candidate, draft, targetOptions, onChange: updateDraft })
    : reclassRuleReadOnlyItems(candidate, targetLabel);
  return [createFieldsSection(`group-account-reclass-rule-${input.selected.id}`, prefixReclassFieldLabels(fields), {
    kind: canEdit ? "fields" : "detail",
    layout: { columns: 2, density: "compact" },
    header: {
      title: "重分类规则",
      description: dirty
        ? "有未保存规则修改"
        : candidate.inheritedFromAccountCode
          ? `继承自 ${candidate.inheritedFromAccountCode}，请在来源科目维护`
          : "反向余额的列报处理",
    },
  })];
}

function prefixReclassFieldLabels(fields: FormSurfaceFieldSpec[]) {
  const labels: Record<string, string> = {
    decision: "重分类处理",
    targetGroupAccountId: "重分类目标科目",
    basis: "重分类计算口径",
  };
  return fields.map((field) => ({ ...field, label: labels[field.key] ?? field.label }));
}
