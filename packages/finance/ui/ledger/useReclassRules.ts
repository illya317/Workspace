"use client";

import { workspacePath } from "@workspace/core/routing";
import { useFeedback } from "@workspace/core/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  FinanceAccountingPolicyVersionOption,
  FinanceGroupAccountCatalogResponse,
  FinanceGroupAccountCatalogRow,
  FinanceGroupAccountMappedLocalAccountRow,
  FinanceGroupAccountMappedLocalAccountsResponse,
  RuleCandidate,
  ScanCandidatesResult,
} from "@workspace/finance/types";
import {
  buildRuleAccountTree,
  filterRuleCandidates,
  initialRuleTreeExpandedIds,
  reclassRuleDraftFromCandidate,
  resolveFilteredRuleSelection,
  sameReclassRuleDraft,
  visibleRuleCandidateIds,
  type ReclassRuleFormDraft,
  type RuleAccountTreeValue,
} from "./reclassRulePresentation";
import type { GroupRuleStatusFilter, ReclassTargetOption } from "./reclassWorkbench";

/** 规则区（左树 + 右详情 + 单科目表单）的状态与数据流；页面级导航守卫仍由 ReclassTab 的合并 dirty 承担。 */
export function useReclassRules({
  canRevise,
  keyword,
  ruleStatusFilter,
  setSaving,
  reloadAdjustments,
}: {
  canRevise: boolean;
  keyword: string;
  ruleStatusFilter: GroupRuleStatusFilter;
  setSaving: (saving: boolean) => void;
  reloadAdjustments: () => Promise<void>;
}) {
  const [ruleCandidates, setRuleCandidates] = useState<RuleCandidate[]>([]);
  const [ruleCatalogRows, setRuleCatalogRows] = useState<FinanceGroupAccountCatalogRow[]>([]);
  const [policyVersions, setPolicyVersions] = useState<FinanceAccountingPolicyVersionOption[]>([]);
  const [selectedPolicyVersionId, setSelectedPolicyVersionId] = useState("");
  const [ruleTargetAccountOptions, setRuleTargetAccountOptions] = useState<ReclassTargetOption[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [selectedRuleAccountId, setSelectedRuleAccountId] = useState<number | null>(null);
  const [ruleTreeExpandedIds, setRuleTreeExpandedIds] = useState<Set<number>>(() => new Set());
  const [ruleFormDraft, setRuleFormDraft] = useState<ReclassRuleFormDraft | null>(null);
  const [ruleMappedRowsByGroup, setRuleMappedRowsByGroup] = useState<Record<number, FinanceGroupAccountMappedLocalAccountRow[]>>({});
  const [ruleMappingDetailState, setRuleMappingDetailState] = useState<Record<number, "loading" | "error">>({});
  const ruleCandidateById = useMemo(
    () => new Map(ruleCandidates.map((row) => [row.groupAccountId, row])),
    [ruleCandidates],
  );
  const ruleCatalogRowById = useMemo(
    () => new Map(ruleCatalogRows.map((row) => [row.id, row])),
    [ruleCatalogRows],
  );
  const selectedRule = useMemo<RuleAccountTreeValue | null>(() => {
    if (selectedRuleAccountId === null) return null;
    const candidate = ruleCandidateById.get(selectedRuleAccountId);
    const row = ruleCatalogRowById.get(selectedRuleAccountId);
    return candidate && row ? { row, candidate } : null;
  }, [ruleCandidateById, ruleCatalogRowById, selectedRuleAccountId]);
  const ruleFormDirty = Boolean(selectedRule && ruleFormDraft
    && !sameReclassRuleDraft(ruleFormDraft, reclassRuleDraftFromCandidate(selectedRule.candidate)));
  const feedback = useFeedback({ unsavedChanges: ruleFormDirty });

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const response = await fetch(workspacePath("/api/modules/finance/ledger/reclass-rules"));
      if (!response.ok) {
        feedback.error("集团重分类规则加载失败");
        return;
      }
      const data = await response.json() as ScanCandidatesResult;
      setRuleCandidates(data.candidates ?? []);
      setPolicyVersions(data.versions ?? []);
      setSelectedPolicyVersionId(String(data.policyVersion.id));
      setRuleTargetAccountOptions((data.accountOptions ?? []).map((account) => ({
        value: String(account.id),
        label: `${account.code} ${account.name}`,
        searchText: account.name,
      })));
      const catalogQuery = new URLSearchParams({ policyVersionId: String(data.policyVersion.id) });
      const catalogResponse = await fetch(workspacePath(`/api/modules/finance/ledger/group-account-catalog?${catalogQuery.toString()}`));
      if (!catalogResponse.ok) {
        feedback.error("集团科目目录加载失败");
        return;
      }
      const catalogData = await catalogResponse.json() as FinanceGroupAccountCatalogResponse;
      setRuleCatalogRows(catalogData.treeRows ?? []);
    } catch {
      feedback.error("网络错误");
    } finally {
      setRulesLoading(false);
    }
  }, [feedback]);

  const loadRuleMappedAccounts = useCallback(async (row: FinanceGroupAccountCatalogRow) => {
    if (ruleMappedRowsByGroup[row.id] || ruleMappingDetailState[row.id] === "loading" || !selectedPolicyVersionId) return;
    setRuleMappingDetailState((current) => ({ ...current, [row.id]: "loading" }));
    try {
      const query = new URLSearchParams({ policyVersionId: selectedPolicyVersionId });
      const result = await fetch(workspacePath(`/api/modules/finance/ledger/group-account-catalog/${row.id}/mappings?${query.toString()}`));
      const data = await result.json().catch(() => null) as FinanceGroupAccountMappedLocalAccountsResponse | { error?: string } | null;
      if (!result.ok || !data || !("rows" in data)) throw new Error(data && "error" in data ? data.error : "公司科目映射加载失败");
      setRuleMappedRowsByGroup((current) => ({ ...current, [row.id]: data.rows }));
      setRuleMappingDetailState((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
    } catch {
      setRuleMappingDetailState((current) => ({ ...current, [row.id]: "error" }));
    }
  }, [ruleMappedRowsByGroup, ruleMappingDetailState, selectedPolicyVersionId]);

  useEffect(() => { void loadRules(); }, [loadRules]);
  useEffect(() => {
    setRuleMappedRowsByGroup({});
    setRuleMappingDetailState({});
  }, [selectedPolicyVersionId]);
  useEffect(() => {
    if (selectedRule) void loadRuleMappedAccounts(selectedRule.row);
  }, [loadRuleMappedAccounts, selectedRule]);

  const filteredRuleCandidates = useMemo(
    () => filterRuleCandidates(ruleCandidates, keyword, ruleStatusFilter),
    [keyword, ruleCandidates, ruleStatusFilter],
  );
  const ruleFilterActive = ruleStatusFilter !== "all" || keyword.trim() !== "";
  const visibleCandidateIds = useMemo(
    () => visibleRuleCandidateIds(filteredRuleCandidates, selectedRuleAccountId, ruleFormDirty),
    [filteredRuleCandidates, ruleFormDirty, selectedRuleAccountId],
  );
  const ruleTreeItems = useMemo(() => buildRuleAccountTree({
    rows: ruleCatalogRows,
    candidates: ruleCandidates,
    visibleCandidateIds,
  }), [ruleCandidates, ruleCatalogRows, visibleCandidateIds]);

  useEffect(() => {
    setSelectedRuleAccountId((currentId) => resolveFilteredRuleSelection({
      currentId,
      allRows: ruleCandidates,
      filteredRows: filteredRuleCandidates,
      filterActive: ruleFilterActive,
      preserveFilteredOutSelection: ruleFormDirty,
    }));
  }, [filteredRuleCandidates, ruleCandidates, ruleFilterActive, ruleFormDirty]);

  useEffect(() => {
    setRuleFormDraft(selectedRule ? reclassRuleDraftFromCandidate(selectedRule.candidate) : null);
  }, [selectedRule]);

  useEffect(() => {
    setRuleTreeExpandedIds(initialRuleTreeExpandedIds({
      rows: ruleCatalogRows,
      candidates: ruleCandidates,
      focusCandidateIds: ruleFilterActive
        ? new Set(filteredRuleCandidates.map((row) => row.groupAccountId))
        : null,
    }));
  }, [filteredRuleCandidates, ruleCandidates, ruleCatalogRows, ruleFilterActive]);

  const activePolicyVersion = policyVersions.find((version) => String(version.id) === selectedPolicyVersionId);
  const canReviseActivePolicyVersion = canRevise && Boolean(activePolicyVersion?.isCurrent);
  const selectedRuleInherited = selectedRule?.candidate.inheritedFromAccountCode ?? null;
  const canEditSelectedRule = canReviseActivePolicyVersion && selectedRule !== null && selectedRuleInherited === null;
  const ruleTargetLabels = useMemo(
    () => new Map(ruleTargetAccountOptions.map((option) => [option.value, option.label])),
    [ruleTargetAccountOptions],
  );

  const updateRuleFormDraft = useCallback((change: Partial<ReclassRuleFormDraft>) => {
    setRuleFormDraft((current) => current ? { ...current, ...change } : current);
  }, []);

  const discardRuleFormDraft = useCallback(() => {
    setRuleFormDraft(selectedRule ? reclassRuleDraftFromCandidate(selectedRule.candidate) : null);
  }, [selectedRule]);

  const selectRuleAccount = useCallback(async (value: RuleAccountTreeValue) => {
    if (value.candidate.groupAccountId === selectedRuleAccountId || !await feedback.confirmLeave()) return;
    setSelectedRuleAccountId(value.candidate.groupAccountId);
  }, [feedback, selectedRuleAccountId]);

  const toggleRuleTreeNode = useCallback((id: string | number, expanded: boolean) => {
    const numericId = Number(id);
    setRuleTreeExpandedIds((current) => {
      const next = new Set(current);
      if (expanded) next.add(numericId);
      else next.delete(numericId);
      return next;
    });
  }, []);

  const saveRule = useCallback(async () => {
    if (!selectedRule || !ruleFormDraft || !ruleFormDirty || !selectedPolicyVersionId) return;
    setSaving(true);
    try {
      const response = await fetch(workspacePath("/api/modules/finance/ledger/reclass-rules"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyVersionId: Number(selectedPolicyVersionId),
          changes: [{
            sourceGroupAccountId: selectedRule.candidate.groupAccountId,
            abnormalSide: selectedRule.candidate.abnormalSide,
            targetGroupAccountId: ruleFormDraft.decision === "reclassify" ? ruleFormDraft.targetGroupAccountId : null,
            basis: ruleFormDraft.basis,
          }],
        }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        feedback.error(result?.error || "规则保存失败");
        return;
      }
      feedback.success("重分类规则已保存");
      await Promise.all([loadRules(), reloadAdjustments()]);
    } catch {
      feedback.error("网络错误");
    } finally {
      setSaving(false);
    }
  }, [feedback, loadRules, reloadAdjustments, ruleFormDraft, ruleFormDirty, selectedPolicyVersionId, selectedRule, setSaving]);

  return {
    ruleCandidates,
    rulesLoading,
    selectedRule,
    selectedRuleAccountId,
    ruleTreeItems,
    ruleTreeExpandedIds,
    ruleFormDraft,
    ruleFormDirty,
    ruleMappedRowsByGroup,
    ruleMappingDetailState,
    filteredRuleCandidates,
    activePolicyVersion,
    canReviseActivePolicyVersion,
    selectedRuleInherited,
    canEditSelectedRule,
    ruleTargetAccountOptions,
    ruleTargetLabels,
    updateRuleFormDraft,
    discardRuleFormDraft,
    selectRuleAccount,
    toggleRuleTreeNode,
    saveRule,
  };
}

export type ReclassRulesController = ReturnType<typeof useReclassRules>;
