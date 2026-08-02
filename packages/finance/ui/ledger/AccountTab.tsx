"use client";

import { workspacePath } from "@workspace/core/routing";
import {
  PageSurface,
  createMasterDetailBody,
  createEmptySection,
  createFieldsSection,
  createPageBody,
  createStatusSection,
  useFeedback,
} from "@workspace/core/ui";
import type {
  BodySurfaceSectionSpec,
  PageSurfaceTabBarSpec,
  SurfaceToolbarItems,
} from "@workspace/core/ui";
import type {
  FinanceGroupAccountOption,
  FinanceGroupAccountReviewStatus,
} from "@workspace/finance/types";
import { useCompanyOptions } from "@workspace/platform/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Account } from "../components/AccountTable";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import {
  buildCompanyAccountTree,
  companyAccountDetailFields,
  companyAccountParentDescription,
  initialExpandedCompanyAccountIds,
} from "./companyAccountPresentation";
import { REVIEW_STATUS_FILTER_OPTIONS } from "./groupAccountMappingPresentation";
import type { FinanceLedgerDefaultScope } from "./defaultScope";
import { useLedgerExportAction } from "./useLedgerExportAction";

export default function AccountTab({
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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [companyFilter, setCompanyFilter] = useState(defaultScope?.companyCode ?? "");
  const [reviewStatusFilter, setReviewStatusFilter] = useState<"" | FinanceGroupAccountReviewStatus>("");
  const [yearFilter, setYearFilter] = useState(defaultScope ? String(defaultScope.year) : "");
  const [keyword, setKeyword] = useState("");
  const [groupAccountOptions, setGroupAccountOptions] = useState<FinanceGroupAccountOption[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedGroupAccountId, setSelectedGroupAccountId] = useState("");
  const [treeExpandedIds, setTreeExpandedIds] = useState<Set<number>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const companyOptions = useCompanyOptions(false);
  const companyNameByCode = useMemo(
    () => new Map(companyOptions.map((option) => [option.value, option.label])),
    [companyOptions],
  );
  const selected = useMemo(
    () => accounts.find((account) => account.id === selectedId) ?? null,
    [accounts, selectedId],
  );
  const currentGroupAccountId = selected?.groupAccount ? String(selected.groupAccount.id) : "";
  const mappingChanged = Boolean(selected && selectedGroupAccountId !== currentGroupAccountId);
  const canSaveMapping = Boolean(
    canRevise
    && selected?.mapping
    && selected.reviewStatus !== "pending_delete"
    && selectedGroupAccountId
    && (mappingChanged || selected.reviewStatus === "pending_review"),
  );
  const feedback = useFeedback({ unsavedChanges: mappingChanged });
  const showError = feedback.error;

  const exportAction = useLedgerExportAction({
    canExport,
    view: "accounts",
    companyCode: companyFilter,
    year: yearFilter,
    keyword,
    fallbackFilename: `${companyNameByCode.get(companyFilter) || companyFilter || "全部公司"}-${yearFilter || "全部年度"}-科目设置.xlsx`,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const params = new URLSearchParams({ page: "1", pageSize: "2000" });
    if (companyFilter) params.set("companyCode", companyFilter);
    if (yearFilter) params.set("year", yearFilter);
    if (keyword) params.set("keyword", keyword);
    if (reviewStatusFilter) params.set("reviewStatus", reviewStatusFilter);
    try {
      const result = await fetch(workspacePath(`/api/modules/finance/ledger/accounts?${params.toString()}`));
      const data = await result.json().catch(() => null) as {
        data?: Account[];
        accounts?: Account[];
        groupAccountOptions?: FinanceGroupAccountOption[];
        error?: string;
      } | null;
      if (!result.ok || !data) throw new Error(data?.error || "公司科目加载失败");
      const rows = data.data ?? data.accounts;
      if (!Array.isArray(rows)) throw new Error("公司科目返回格式错误");
      setAccounts(rows);
      setGroupAccountOptions(data.groupAccountOptions ?? []);
      setSelectedId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id ?? null);
      setTreeExpandedIds(initialExpandedCompanyAccountIds(rows));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "公司科目加载失败";
      setAccounts([]);
      setGroupAccountOptions([]);
      setSelectedId(null);
      setLoadError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  }, [companyFilter, keyword, reviewStatusFilter, showError, yearFilter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setSelectedGroupAccountId(currentGroupAccountId); }, [currentGroupAccountId, selectedId]);

  const selectAccount = useCallback(async (row: Account) => {
    if (row.id === selectedId || !await feedback.confirmLeave()) return;
    setSelectedId(row.id);
  }, [feedback, selectedId]);

  const changeScope = useCallback(async (apply: () => void) => {
    if (!await feedback.confirmLeave()) return;
    apply();
  }, [feedback]);

  const saveMapping = useCallback(async () => {
    if (!selected?.mapping || !canSaveMapping) return;
    setSaving(true);
    try {
      const result = await fetch(workspacePath("/api/modules/finance/ledger/group-accounts"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: [{
          mappingId: selected.mapping.id,
          targetGroupAccountId: Number(selectedGroupAccountId),
          expectedUpdatedAt: selected.mapping.updatedAt,
        }] }),
      });
      const data = await result.json().catch(() => null) as { error?: string } | null;
      if (!result.ok) throw new Error(data?.error || "科目映射保存失败");
      feedback.success("公司科目映射已复核");
      await load();
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "科目映射保存失败");
    } finally {
      setSaving(false);
    }
  }, [canSaveMapping, feedback, load, selected, selectedGroupAccountId]);

  const extraToolbarItems: SurfaceToolbarItems = [
    {
      kind: "select",
      key: "review-status",
      label: "复核状态",
      value: reviewStatusFilter,
      placeholder: "全部",
      options: [...REVIEW_STATUS_FILTER_OPTIONS],
      onChange: (value) => { void changeScope(() => setReviewStatusFilter(value as typeof reviewStatusFilter)); },
    },
    ...(exportAction ? [exportAction] : []),
  ];
  const toolbarItems = useFinanceFilterToolbarItems({
    companyFilter,
    yearFilter,
    keyword,
    onCompanyChange: (value) => { void changeScope(() => setCompanyFilter(value)); },
    onYearChange: (value) => { void changeScope(() => setYearFilter(value)); },
    onKeywordChange: (value) => { void changeScope(() => setKeyword(value)); },
    showMonth: false,
    showPageSize: false,
    extraItems: extraToolbarItems,
  });
  const treeItems = useMemo(() => buildCompanyAccountTree(accounts), [accounts]);
  const treeSelector = {
    kind: "tree" as const,
    title: "公司科目层级",
    items: treeItems,
    selectedId,
    loading,
    loadingText: "加载公司科目...",
    emptyText: loadError || "暂无科目数据",
    expandedIds: treeExpandedIds,
    onToggle: (id: string | number, expanded: boolean) => {
      const numericId = Number(id);
      setTreeExpandedIds((current) => {
        const next = new Set(current);
        if (expanded) next.add(numericId);
        else next.delete(numericId);
        return next;
      });
    },
    onSelect: (row: Account) => { void selectAccount(row); },
  };
  const detailSections = loading
    ? [createStatusSection("company-account-loading", { kind: "loading", content: "加载公司科目..." })]
    : loadError
      ? [createStatusSection("company-account-error", { kind: "error", content: loadError })]
      : selected
        ? [createFieldsSection(
            "company-account-detail",
            companyAccountDetailFields({
              row: selected,
              groupAccountOptions,
              selectedGroupAccountId,
              canRevise,
              onGroupAccountChange: setSelectedGroupAccountId,
            }),
            {
              kind: canRevise ? "fields" : "detail",
              layout: { columns: 2, density: "compact" },
              header: {
                title: `${selected.code} ${selected.name}`,
                description: mappingChanged
                  ? "集团映射有未保存修改"
                  : selected.reviewStatus === "pending_review"
                    ? "保存当前集团映射即可完成复核"
                    : companyAccountParentDescription(selected),
              },
              actions: canRevise ? [{
                key: "save-company-account-mapping",
                action: "save" as const,
                label: saving ? "保存中..." : "保存",
                disabled: saving || !canSaveMapping,
                onClick: () => { void saveMapping(); },
              }] : [],
            },
          )]
        : [createEmptySection("company-account-empty", {
            content: "从左侧选择公司科目查看详情",
            presentation: "card",
          })];

  return (
    <PageSurface
      kind="standard"
      tabbar={navigation}
      toolbar={{ items: toolbarItems }}
      body={createMasterDetailBody({
        master: { label: "公司科目层级", presentation: "compact", body: { kind: "selector", selector: treeSelector } },
        detail: createPageBody([...lifecycleBlocks, ...detailSections]),
        desktop: { ratio: [1, 2] },
        mobile: { detailActive: selected !== null },
      })}
    />
  );
}
