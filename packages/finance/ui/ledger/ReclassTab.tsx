"use client";

import { useCSV, usePageDraft } from "@workspace/core/hooks";
import { workspacePath } from "@workspace/core/routing";
import {
  PageSurface,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  useFeedback,
} from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, PageSurfaceTabBarSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ReclassEntry, RuleCandidate, ScanCandidatesResult } from "@workspace/finance/types";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import type { FinanceLedgerDefaultScope } from "./defaultScope";
import {
  createGroupReclassRuleColumns,
  createReclassWorkbenchColumns,
  filterGroupRuleCandidates,
  filterReclassEntries,
  groupRuleKey,
  type GroupRuleStatusFilter,
  type ReclassTargetOption,
  type ReclassWorkbenchFilter,
} from "./reclassWorkbench";

const NO_RECLASS_VALUE = "__no_reclass__";

type ReclassSection = "rules" | "adjustments";

export default function ReclassTab({
  canRevise,
  canExport,
  defaultScope,
  navigation,
  lifecycleBlocks = [],
}: {
  canRevise: boolean;
  canExport: boolean;
  defaultScope: FinanceLedgerDefaultScope | null;
  navigation?: PageSurfaceTabBarSpec;
  lifecycleBlocks?: BodySurfaceSectionSpec[];
}) {
  const activeSection: ReclassSection = navigation?.activeChild === "adjustments" ? "adjustments" : "rules";
  const [companyFilter, setCompanyFilter] = useState(defaultScope?.companyCode ?? "");
  const [yearFilter, setYearFilter] = useState(defaultScope ? String(defaultScope.year) : "");
  const [monthFilter, setMonthFilter] = useState(defaultScope ? String(defaultScope.month) : "");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReclassWorkbenchFilter>("attention");
  const [ruleStatusFilter, setRuleStatusFilter] = useState<GroupRuleStatusFilter>("unconfirmed");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [entries, setEntries] = useState<ReclassEntry[]>([]);
  const [ruleCandidates, setRuleCandidates] = useState<RuleCandidate[]>([]);
  const [targetOptions, setTargetOptions] = useState<ReclassTargetOption[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [adjustmentsLoading, setAdjustmentsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const ruleDraft = usePageDraft<string, string>();
  const adjustmentDraft = usePageDraft<string, string>();
  const feedback = useFeedback({ unsavedChanges: ruleDraft.dirty || adjustmentDraft.dirty });

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
      setTargetOptions((data.accountOptions ?? []).map((account) => ({
        value: account.code,
        label: `${account.code} ${account.name}`,
        searchText: account.name,
      })));
    } catch {
      feedback.error("网络错误");
    } finally {
      setRulesLoading(false);
    }
  }, [feedback]);

  const loadAdjustments = useCallback(async () => {
    if (!companyFilter || !yearFilter || !monthFilter) {
      setEntries([]);
      return;
    }
    setAdjustmentsLoading(true);
    try {
      const query = new URLSearchParams({ companyCode: companyFilter, year: yearFilter, month: monthFilter });
      const response = await fetch(workspacePath(`/api/modules/finance/ledger/schedules/reclassify?${query.toString()}`));
      if (!response.ok) {
        feedback.error("凭证重分类调整加载失败");
        return;
      }
      const data = await response.json() as {
        entries?: ReclassEntry[];
      };
      setEntries(data.entries ?? []);
    } catch {
      feedback.error("网络错误");
    } finally {
      setAdjustmentsLoading(false);
    }
  }, [companyFilter, feedback, monthFilter, yearFilter]);

  useEffect(() => { void loadRules(); }, [loadRules]);
  useEffect(() => { void loadAdjustments(); }, [loadAdjustments]);
  useEffect(() => { setPage(1); }, [activeSection, companyFilter, keyword, monthFilter, ruleStatusFilter, statusFilter, yearFilter]);

  const filteredRules = useMemo(() => filterGroupRuleCandidates(ruleCandidates, keyword, ruleStatusFilter), [keyword, ruleCandidates, ruleStatusFilter]);
  const filtered = useMemo(() => filterReclassEntries(entries, statusFilter, keyword), [entries, keyword, statusFilter]);
  const filterOptions = useMemo(() => {
    const attention = entries.filter((row) => row.status === "pending"
      || row.status === "configured"
      || (row.stale && (row.status === "approved" || row.status === "adjusted"))).length;
    const processed = entries.filter((row) => !row.stale && (row.status === "approved" || row.status === "adjusted")).length;
    const exempt = entries.filter((row) => row.status === "exempt" || row.status === "rejected").length;
    const historical = entries.filter((row) => row.status === "historical").length;
    return [
      { value: "attention", label: `待处理 ${attention}` },
      { value: "processed", label: `已重分类 ${processed}` },
      { value: "exempt", label: `无需重分类 ${exempt}` },
      { value: "historical", label: `历史记录 ${historical}` },
      { value: "all", label: `全部 ${entries.length}` },
    ];
  }, [entries]);
  const activeTotal = activeSection === "rules" ? filteredRules.length : filtered.length;
  const totalPages = Math.max(1, Math.ceil(activeTotal / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pagedRules = filteredRules.slice((page - 1) * pageSize, page * pageSize);

  const changeScope = useCallback(async (apply: () => void) => {
    if (!await feedback.confirmLeave()) return;
    ruleDraft.cancelEdit();
    adjustmentDraft.cancelEdit();
    apply();
  }, [adjustmentDraft, feedback, ruleDraft]);

  const changeSection = useCallback(async (next: ReclassSection) => {
    if (next === activeSection || !await feedback.confirmLeave()) return;
    ruleDraft.cancelEdit();
    adjustmentDraft.cancelEdit();
    navigation?.onChildChange?.(next);
  }, [activeSection, adjustmentDraft, feedback, navigation, ruleDraft]);

  const changeParentTab = useCallback(async (next: string) => {
    if (next === navigation?.active || !await feedback.confirmLeave()) return;
    ruleDraft.cancelEdit();
    adjustmentDraft.cancelEdit();
    navigation?.onChange(next);
  }, [adjustmentDraft, feedback, navigation, ruleDraft]);

  const pageNavigation = useMemo(() => navigation ? {
    ...navigation,
    onChange: (key: string) => { void changeParentTab(key); },
    onChildChange: (key: string) => {
      if (key === "rules" || key === "adjustments") void changeSection(key);
    },
  } : undefined, [changeParentTab, changeSection, navigation]);

  const saveRules = useCallback(async () => {
    if (!ruleDraft.dirty) return;
    const rowMap = new Map(ruleCandidates.map((row) => [groupRuleKey(row), row]));
    const changes = ruleDraft.changes.flatMap((change) => {
      const row = rowMap.get(change.key);
      if (!row) return [];
      return [{
        sourceAccountCode: row.accountCode,
        abnormalSide: row.abnormalSide,
        targetAccountCode: change.value === NO_RECLASS_VALUE || !change.value.trim() ? null : change.value.trim(),
      }];
    });
    if (changes.length === 0) return;
    setSaving(true);
    try {
      const response = await fetch(workspacePath("/api/modules/finance/ledger/reclass-rules"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        feedback.error(result?.error || "规则保存失败");
        return;
      }
      ruleDraft.acceptChanges();
      feedback.success(`已保存 ${changes.length} 项集团重分类规则`);
      await Promise.all([loadRules(), loadAdjustments()]);
    } catch {
      feedback.error("网络错误");
    } finally {
      setSaving(false);
    }
  }, [feedback, loadAdjustments, loadRules, ruleCandidates, ruleDraft]);

  const saveAdjustments = useCallback(async () => {
    if (!adjustmentDraft.dirty) return;
    const rowMap = new Map(entries.map((row) => [adjustmentKey(row), row]));
    const changes = adjustmentDraft.changes.flatMap((change) => {
      const row = rowMap.get(change.key);
      if (!row) return [];
      return [{ periodId: row.periodId, sourceAccountCode: row.accountCode, targetAccountCode: change.value.trim() }];
    });
    if (changes.some((change) => !change.targetAccountCode)) {
      feedback.error("凭证重分类调整必须选择目标科目");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(workspacePath("/api/modules/finance/ledger/reclass-adjustments"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        feedback.error(result?.error || "重分类调整保存失败");
        return;
      }
      adjustmentDraft.acceptChanges();
      feedback.success(`已保存 ${changes.length} 项重分类调整`);
      await loadAdjustments();
    } catch {
      feedback.error("网络错误");
    } finally {
      setSaving(false);
    }
  }, [adjustmentDraft, entries, feedback, loadAdjustments]);

  const ruleTargetOptions = useMemo(() => [
    { value: NO_RECLASS_VALUE, label: "无需重分类", searchText: "无需重分类" },
    ...targetOptions,
  ], [targetOptions]);

  const ruleColumns = useMemo(() => createGroupReclassRuleColumns({
    canRevise,
    editMode: ruleDraft.editMode,
    targetOptions: ruleTargetOptions,
    targetValue: (row) => ruleDraft.valueFor(groupRuleKey(row), row.effectiveDecision === "no_reclass" ? NO_RECLASS_VALUE : row.existingTarget ?? ""),
    onTargetChange: (row, value) => ruleDraft.setDraft(groupRuleKey(row), row.effectiveDecision === "no_reclass" ? NO_RECLASS_VALUE : row.existingTarget ?? "", value),
  }), [canRevise, ruleDraft, ruleTargetOptions]);
  const adjustmentColumns = useMemo(() => createReclassWorkbenchColumns({
    canRevise,
    editMode: adjustmentDraft.editMode,
    targetOptions,
    targetValue: (row) => adjustmentDraft.valueFor(adjustmentKey(row), row.targetAccountCode ?? ""),
    onTargetChange: (row, value) => adjustmentDraft.setDraft(adjustmentKey(row), row.targetAccountCode ?? "", value),
  }), [adjustmentDraft, canRevise, targetOptions]);

  const exportCSV = useCSV(
    `重分类工作台_${companyFilter}_${yearFilter}${monthFilter}.csv`,
    "科目编码,科目名称,报表应用或候选金额,当前反向余额,是否过期,判断口径,处理状态,目标科目\n",
    () => filtered.map((row) => [
      row.accountCode,
      row.accountName,
      row.amount,
      row.currentAbnormalAmount ?? "",
      row.stale ? "待复核" : "",
      row.classification,
      row.status,
      row.targetAccountCode ?? "",
    ].map(csvCell).join(",")).join("\n"),
  );

  const extraToolbarItems: SurfaceToolbarItems = activeSection === "rules" ? [
    {
      kind: "select",
      key: "reclass-rule-status",
      label: "重分类状态",
      value: ruleStatusFilter,
      options: [
        { value: "all", label: "全部" },
        { value: "reclassified", label: "已重分类" },
        { value: "no_reclass", label: "无需重分类" },
        { value: "unconfirmed", label: "未确认" },
      ],
      onChange: (value: string) => setRuleStatusFilter(value as GroupRuleStatusFilter),
    },
    ...(canRevise ? [{
      kind: "edit-group" as const,
      key: "reclass-rule-edit",
      editMode: ruleDraft.editMode,
      dirty: ruleDraft.dirty,
      canEdit: canRevise,
      saving,
      onStartEdit: ruleDraft.startEdit,
      onSave: saveRules,
      onCancel: ruleDraft.cancelEdit,
    }] : []),
    { kind: "text", key: "reclass-rule-count", content: `${filteredRules.length} 项可配置规则` },
  ] : activeSection === "adjustments" ? [
    {
      kind: "select",
      key: "reclass-status",
      label: "处理范围",
      value: statusFilter,
      options: filterOptions,
      onChange: (value: string) => setStatusFilter(value as ReclassWorkbenchFilter),
    },
    ...(canRevise ? [{
      kind: "edit-group" as const,
      key: "reclass-adjustment-edit",
      editMode: adjustmentDraft.editMode,
      dirty: adjustmentDraft.dirty,
      canEdit: filtered.some(isAdjustmentEditable),
      saving,
      onStartEdit: adjustmentDraft.startEdit,
      onSave: saveAdjustments,
      onCancel: adjustmentDraft.cancelEdit,
    }] : []),
    ...(canExport ? [{
      kind: "action-group" as const,
      key: "reclass-export",
      actions: [{ key: "export", kind: "download" as const, label: "导出CSV", onClick: exportCSV, disabled: filtered.length === 0 }],
    }] : []),
    { kind: "text", key: "reclass-count", content: `${filtered.length} 项` },
  ] : [];
  const toolbarItems = useFinanceFilterToolbarItems({
    companyFilter,
    yearFilter,
    monthFilter,
    keyword,
    pageSize,
    onCompanyChange: (value) => { void changeScope(() => setCompanyFilter(value)); },
    onYearChange: (value) => { void changeScope(() => setYearFilter(value)); },
    onMonthChange: (value) => { void changeScope(() => setMonthFilter(value)); },
    onKeywordChange: setKeyword,
    onPageSizeChange: (value) => { setPageSize(value); setPage(1); },
    showCompanyYear: activeSection === "adjustments",
    showMonth: activeSection === "adjustments",
    showPageSize: true,
    extraItems: extraToolbarItems,
  });

  const ruleSections = [
    ...(rulesLoading
      ? [createStatusSection("group-rules-loading", { kind: "loading", content: "加载中..." })]
      : filteredRules.length === 0
        ? [createStatusSection("group-rules-empty", { kind: "empty", content: ruleCandidates.length === 0 ? "暂无可配置科目" : "当前筛选范围没有规则" })]
        : [createPageTableSection("group-rule-table", {
            rows: pagedRules,
            columns: ruleColumns,
            visibleColumns: ruleColumns.map((column) => column.key),
            rowKey: groupRuleKey,
            presentation: { density: "compact" },
          })]),
  ];
  const adjustmentSections = [
    ...(adjustmentsLoading
      ? [createStatusSection("reclass-loading", { kind: "loading", content: "加载中..." })]
      : paged.length === 0
        ? [createStatusSection("reclass-empty", { kind: "empty", content: entries.length === 0 ? "当前期间没有反向期末余额或凭证调整记录" : "当前筛选范围没有事项" })]
        : [createPageTableSection("reclass-workbench", {
            rows: paged,
            columns: adjustmentColumns,
            visibleColumns: adjustmentColumns.map((column) => column.key),
            rowKey: (row) => row.id,
            presentation: { density: "compact" },
          })]),
  ];

  return (
    <PageSurface
      kind="standard"
      tabbar={pageNavigation}
      toolbar={{ items: toolbarItems }}
      body={createPageBody([
        ...lifecycleBlocks,
        ...(activeSection === "rules" ? ruleSections : adjustmentSections),
      ])}
      footer={activeTotal > 0 ? { pagination: { page, totalPages, total: activeTotal, onPageChange: setPage } } : undefined}
    />
  );
}

function csvCell(value: string | number) {
  const text = String(value).replaceAll('"', '""');
  return text.includes(",") || text.includes('"') || text.includes("\n") ? `"${text}"` : text;
}

function adjustmentKey(row: ReclassEntry) {
  return `${row.periodId}::${row.accountCode}`;
}

function isAdjustmentEditable(row: ReclassEntry) {
  return row.sourceType !== "legacy_voucher"
    && (row.classification === "reclass_candidate" || row.classification === "pending_review")
    && row.status !== "exempt"
    && row.currentAbnormalAmount !== null
    && row.currentAbnormalAmount > 0;
}
