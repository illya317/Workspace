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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  GroupAccountOption,
  ReclassEntry,
} from "@workspace/finance/types";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import type { FinanceLedgerDefaultScope } from "./defaultScope";
import { createReclassRulesBody } from "./reclassRulesSection";
import {
  createReclassWorkbenchColumns,
  filterReclassEntries,
  isGrossRowWithoutFacts,
  type GroupRuleStatusFilter,
  type ReclassTargetOption,
  type ReclassWorkbenchFilter,
} from "./reclassWorkbench";
import { useReclassRules } from "./useReclassRules";

const NO_RECLASS_VALUE = "__no_reclass__";
const RESTORE_AUTO_VALUE = "__restore_auto__";

type ReclassSection = "rules" | "adjustments";
type AdjustmentSaveChange =
  | { operation: "restore_auto"; periodId: number; sourceAccountCode: string }
  | {
      operation: "manual";
      periodId: number;
      sourceAccountCode: string;
      decision: "reclassify" | "no_reclass";
      targetAccountCode: string | null;
    };

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
  const [statusFilter, setStatusFilter] = useState<ReclassWorkbenchFilter>("all");
  const [ruleStatusFilter, setRuleStatusFilter] = useState<GroupRuleStatusFilter>("unconfirmed");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [entries, setEntries] = useState<ReclassEntry[]>([]);
  const [adjustmentTargetOptions, setAdjustmentTargetOptions] = useState<ReclassTargetOption[]>([]);
  const [adjustmentsLoading, setAdjustmentsLoading] = useState(false);
  const [adjustmentPeriodClosed, setAdjustmentPeriodClosed] = useState(false);
  const [saving, setSaving] = useState(false);
  const adjustmentDraft = usePageDraft<string, string>();
  const reloadAdjustmentsRef = useRef<() => Promise<void>>(async () => {});
  const reloadAdjustments = useCallback(() => reloadAdjustmentsRef.current(), []);
  const rules = useReclassRules({ canRevise, keyword, ruleStatusFilter, setSaving, reloadAdjustments });
  const feedback = useFeedback({ unsavedChanges: rules.ruleFormDirty || adjustmentDraft.dirty });

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
        isClosed?: boolean;
        accountOptions?: GroupAccountOption[];
      };
      setEntries(data.entries ?? []);
      setAdjustmentPeriodClosed(Boolean(data.isClosed));
      setAdjustmentTargetOptions((data.accountOptions ?? []).map((account) => ({
        value: account.code,
        label: `${account.code} ${account.name}`,
        searchText: account.name,
      })));
    } catch {
      feedback.error("网络错误");
    } finally {
      setAdjustmentsLoading(false);
    }
  }, [companyFilter, feedback, monthFilter, yearFilter]);

  useEffect(() => { reloadAdjustmentsRef.current = loadAdjustments; }, [loadAdjustments]);
  useEffect(() => { void loadAdjustments(); }, [loadAdjustments]);
  useEffect(() => { setPage(1); }, [activeSection, companyFilter, keyword, monthFilter, ruleStatusFilter, statusFilter, yearFilter]);

  const filtered = useMemo(() => filterReclassEntries(entries, statusFilter, keyword), [entries, keyword, statusFilter]);
  const filterOptions = useMemo(() => {
    const pending = entries.filter((row) => row.status === "pending").length;
    const automatic = entries.filter((row) => row.status === "automatic").length;
    const manual = entries.filter((row) => row.status === "manual").length;
    const noProcess = entries.filter((row) => row.status === "no_process").length;
    const historical = entries.filter((row) => row.status === "historical").length;
    return [
      { value: "all", label: `全部 ${entries.length}` },
      { value: "pending", label: `待处理 ${pending}` },
      { value: "automatic", label: `自动分类 ${automatic}` },
      { value: "manual", label: `人工分类 ${manual}` },
      { value: "no_process", label: `无需处理 ${noProcess}` },
      { value: "historical", label: `历史记录 ${historical}` },
    ];
  }, [entries]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const changeScope = useCallback(async (apply: () => void) => {
    if (!await feedback.confirmLeave()) return;
    adjustmentDraft.cancelEdit();
    rules.discardRuleFormDraft();
    apply();
  }, [adjustmentDraft, feedback, rules]);

  const changeSection = useCallback(async (next: string) => {
    if (next === navigation?.activeChild || !await feedback.confirmLeave()) return;
    adjustmentDraft.cancelEdit();
    rules.discardRuleFormDraft();
    navigation?.onChildChange?.(next);
  }, [adjustmentDraft, feedback, navigation, rules]);

  const changeParentTab = useCallback(async (next: string) => {
    if (next === navigation?.active || !await feedback.confirmLeave()) return;
    adjustmentDraft.cancelEdit();
    rules.discardRuleFormDraft();
    navigation?.onChange(next);
  }, [adjustmentDraft, feedback, navigation, rules]);

  const pageNavigation = useMemo(() => navigation ? {
    ...navigation,
    onChange: (key: string) => { void changeParentTab(key); },
    onChildChange: (key: string) => { void changeSection(key); },
  } : undefined, [changeParentTab, changeSection, navigation]);

  const saveAdjustments = useCallback(async () => {
    if (!adjustmentDraft.dirty) return;
    const rowMap = new Map(entries.map((row) => [adjustmentKey(row), row]));
    const changes = adjustmentDraft.changes.flatMap<AdjustmentSaveChange>((change) => {
      const row = rowMap.get(change.key);
      if (!row) return [];
      const value = change.value.trim();
      if (value === RESTORE_AUTO_VALUE) {
        return [{ operation: "restore_auto" as const, periodId: row.periodId, sourceAccountCode: row.accountCode }];
      }
      if (value === NO_RECLASS_VALUE) {
        return [{
          operation: "manual" as const,
          periodId: row.periodId,
          sourceAccountCode: row.accountCode,
          decision: "no_reclass" as const,
          targetAccountCode: null,
        }];
      }
      return [{
        operation: "manual" as const,
        periodId: row.periodId,
        sourceAccountCode: row.accountCode,
        decision: "reclassify" as const,
        targetAccountCode: value,
      }];
    });
    if (changes.some((change) => change.operation === "manual" && change.decision === "reclassify" && !change.targetAccountCode)) {
      feedback.error("人工分类必须选择目标科目");
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
      feedback.success(`已处理 ${changes.length} 项重分类调整`);
      await loadAdjustments();
    } catch {
      feedback.error("网络错误");
    } finally {
      setSaving(false);
    }
  }, [adjustmentDraft, entries, feedback, loadAdjustments]);

  const adjustmentColumns = useMemo(() => createReclassWorkbenchColumns({
    canRevise,
    editMode: adjustmentDraft.editMode,
    targetOptionsForRow: (row) => [
      { value: NO_RECLASS_VALUE, label: "无需处理", searchText: "无需处理" },
      ...(row.sourceType === "manual" && !adjustmentPeriodClosed && !isGrossRowWithoutFacts(row)
        ? [{ value: RESTORE_AUTO_VALUE, label: "恢复自动分类", searchText: "恢复自动分类" }]
        : []),
      ...((row.currentAbnormalAmount ?? 0) > 0 ? adjustmentTargetOptions : []),
    ],
    targetValue: (row) => adjustmentDraft.valueFor(adjustmentKey(row), adjustmentValue(row)),
    onTargetChange: (row, value) => adjustmentDraft.setDraft(adjustmentKey(row), adjustmentValue(row), value),
  }), [adjustmentDraft, adjustmentPeriodClosed, adjustmentTargetOptions, canRevise]);

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
    { kind: "text", key: "reclass-rule-count", content: rules.activePolicyVersion?.isCurrent
      ? `${rules.filteredRuleCandidates.length} 项可配置规则`
      : `${rules.filteredRuleCandidates.length} 项历史规则 · 只读` },
  ] : activeSection === "adjustments" ? [
    {
      kind: "select",
      key: "reclass-status",
      label: "分类方式",
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
    showPageSize: activeSection === "adjustments",
    extraItems: extraToolbarItems,
  });

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
      body={activeSection === "rules"
        ? createReclassRulesBody({ controller: rules, lifecycleBlocks, saving })
        : createPageBody([...lifecycleBlocks, ...adjustmentSections])}
      footer={activeSection === "adjustments" && filtered.length > 0
        ? { pagination: { page, totalPages, total: filtered.length, onPageChange: setPage } }
        : undefined}
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
    && row.status !== "historical"
    && (row.stale || (row.currentAbnormalAmount !== null && row.currentAbnormalAmount > 0));
}

function adjustmentValue(row: ReclassEntry) {
  return row.decision === "no_reclass" ? NO_RECLASS_VALUE : row.targetAccountCode ?? "";
}
