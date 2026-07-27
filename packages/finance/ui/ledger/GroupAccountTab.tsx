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
  FinanceGroupAccountCatalogResponse,
  FinanceGroupAccountCatalogRow,
  FinanceGroupAccountMappedLocalAccountRow,
  FinanceGroupAccountMappedLocalAccountsResponse,
} from "@workspace/finance/types";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import {
  emptyGroupAccountCatalogCreateDraft,
  groupAccountCatalogCreateSections,
  groupAccountCatalogEditDraft,
  groupAccountCatalogEditSections,
  type GroupAccountCatalogCreateDraft,
  type GroupAccountCatalogEditDraft,
} from "./groupAccountCatalogCreate";
import {
  buildGroupAccountTree,
  groupAccountDetailFields,
  groupAccountParentDescription,
  initialExpandedTreeIds,
  mappedAccountSections,
} from "./groupAccountCatalogPresentation";
import { REVIEW_STATUS_FILTER_OPTIONS, versionCreatedDate } from "./groupAccountMappingPresentation";

export default function GroupAccountTab({
  navigation,
  lifecycleBlocks = [],
  canRevise,
  canDelete,
  canApprove,
}: {
  navigation?: PageSurfaceTabBarSpec;
  lifecycleBlocks?: BodySurfaceSectionSpec[];
  canRevise: boolean;
  canDelete: boolean;
  canApprove: boolean;
}) {
  const businessTimeZone = useTenantConfig().localization.businessTimeZone;
  const [response, setResponse] = useState<FinanceGroupAccountCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [versionFilter, setVersionFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [reviewStatusFilter, setReviewStatusFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [treeExpandedIds, setTreeExpandedIds] = useState<Set<number>>(() => new Set());
  const [createDraft, setCreateDraft] = useState<GroupAccountCatalogCreateDraft | null>(null);
  const [editDraft, setEditDraft] = useState<GroupAccountCatalogEditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [mappedRowsByGroup, setMappedRowsByGroup] = useState<Record<number, FinanceGroupAccountMappedLocalAccountRow[]>>({});
  const [mappingDetailState, setMappingDetailState] = useState<Record<number, "loading" | "error">>({});
  const selected = useMemo(
    () => response?.treeRows.find((row) => row.id === selectedId) ?? null,
    [response, selectedId],
  );
  const editDirty = Boolean(selected && editDraft && editDraft.id === selected.id
    && !sameGroupAccountDraft(editDraft, groupAccountCatalogEditDraft(selected)));
  const feedback = useFeedback({ unsavedChanges: editDirty });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams();
    if (versionFilter) query.set("policyVersionId", versionFilter);
    if (categoryFilter) query.set("category", categoryFilter);
    if (reviewStatusFilter) query.set("reviewStatus", reviewStatusFilter);
    if (keyword.trim()) query.set("keyword", keyword.trim());
    try {
      const result = await fetch(workspacePath(`/api/modules/finance/ledger/group-account-catalog?${query.toString()}`));
      if (!result.ok) throw new Error("集团科目加载失败");
      const data = await result.json() as FinanceGroupAccountCatalogResponse;
      setResponse(data);
      setSelectedId((current) => data.treeRows.some((row) => row.id === current)
        ? current
        : data.rows[0]?.id ?? data.treeRows[0]?.id ?? null);
      setTreeExpandedIds(initialExpandedTreeIds(data, Boolean(reviewStatusFilter || keyword.trim())));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "集团科目加载失败");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, keyword, reviewStatusFilter, versionFilter]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setMappedRowsByGroup({});
    setMappingDetailState({});
  }, [response?.selectedPolicyVersionId]);

  useEffect(() => {
    setEditDraft(selected ? groupAccountCatalogEditDraft(selected) : null);
  }, [selected]);

  const selectedVersionIsCurrent = response?.selectedPolicyVersionId === response?.currentPolicyVersionId;
  const createGroupAccount = useCallback(async () => {
    if (!createDraft) return;
    setSaving(true);
    try {
      const result = await fetch(workspacePath("/api/modules/finance/ledger/group-accounts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "catalog", ...createDraft }),
      });
      const data = await result.json().catch(() => null) as { error?: string } | null;
      if (!result.ok) throw new Error(data?.error || "集团科目新增失败");
      setCreateDraft(null);
      await load();
      return { outcome: "saved" as const, message: "集团科目已新增到当前版本" };
    } finally {
      setSaving(false);
    }
  }, [createDraft, load]);

  const updateGroupAccount = useCallback(async () => {
    if (!editDraft) return;
    setSaving(true);
    try {
      const { id, ...body } = editDraft;
      const result = await fetch(workspacePath(`/api/modules/finance/ledger/group-accounts/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await result.json().catch(() => null) as { error?: string } | null;
      if (!result.ok) throw new Error(data?.error || "集团科目保存失败");
      setEditDraft(null);
      feedback.success("集团科目已保存");
      await load();
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "集团科目保存失败");
    } finally {
      setSaving(false);
    }
  }, [editDraft, feedback, load]);

  const loadMappedAccounts = useCallback(async (row: FinanceGroupAccountCatalogRow) => {
    if (mappedRowsByGroup[row.id] || mappingDetailState[row.id] === "loading" || !response) return;
    setMappingDetailState((current) => ({ ...current, [row.id]: "loading" }));
    try {
      const query = new URLSearchParams({ policyVersionId: String(response.selectedPolicyVersionId) });
      const result = await fetch(workspacePath(`/api/modules/finance/ledger/group-account-catalog/${row.id}/mappings?${query.toString()}`));
      const data = await result.json().catch(() => null) as FinanceGroupAccountMappedLocalAccountsResponse | { error?: string } | null;
      if (!result.ok || !data || !("rows" in data)) throw new Error(data && "error" in data ? data.error : "公司科目映射加载失败");
      setMappedRowsByGroup((current) => ({ ...current, [row.id]: data.rows }));
      setMappingDetailState((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
    } catch {
      setMappingDetailState((current) => ({ ...current, [row.id]: "error" }));
    }
  }, [mappedRowsByGroup, mappingDetailState, response]);

  useEffect(() => {
    if (selected) void loadMappedAccounts(selected);
  }, [loadMappedAccounts, selected]);

  const selectGroupAccount = useCallback(async (row: FinanceGroupAccountCatalogRow) => {
    if (row.id === selectedId || !await feedback.confirmLeave()) return;
    setSelectedId(row.id);
  }, [feedback, selectedId]);

  const deleteGroupAccount = useCallback(async (row: FinanceGroupAccountCatalogRow) => {
    const confirmed = await feedback.confirmDelete({
      message: `确定删除集团科目“${row.code} ${row.name}”吗？仍有公司映射、下级科目或重分类引用时系统会阻止删除。`,
    });
    if (!confirmed) return;
    setSaving(true);
    try {
      const result = await fetch(workspacePath(`/api/modules/finance/ledger/group-accounts/${row.id}`), { method: "DELETE" });
      const data = await result.json().catch(() => null) as { error?: string } | null;
      if (!result.ok) throw new Error(data?.error || "集团科目删除失败");
      feedback.success("集团科目已删除");
      await load();
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "集团科目删除失败");
    } finally {
      setSaving(false);
    }
  }, [feedback, load]);

  const reviewGroupAccount = useCallback(async (
    row: FinanceGroupAccountCatalogRow,
    decision: "approve" | "reject",
  ) => {
    if (row.reviewStatus === "pending_delete" && decision === "approve") {
      const confirmed = await feedback.confirmDelete({
        message: `确定批准删除集团科目“${row.code} ${row.name}”吗？删除后不可恢复；仍有公司映射、下级科目或重分类引用时系统会阻止删除。`,
      });
      if (!confirmed) return;
    }
    setSaving(true);
    try {
      const result = await fetch(workspacePath(`/api/modules/finance/ledger/group-accounts/${row.id}/review`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, expectedUpdatedAt: row.updatedAt }),
      });
      const data = await result.json().catch(() => null) as {
        error?: string;
        reviewStatus?: string;
        originMappingConfirmed?: boolean;
      } | null;
      if (!result.ok) throw new Error(data?.error || "集团科目复核失败");
      feedback.success(data?.reviewStatus === "reviewed"
        ? data.originMappingConfirmed
          ? "集团科目及来源公司科目映射已复核"
          : "集团科目已复核"
        : data?.reviewStatus === "pending_delete"
          ? "集团科目已标记为待删除"
          : "集团科目已删除");
      await load();
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "集团科目复核失败");
    } finally {
      setSaving(false);
    }
  }, [feedback, load]);

  const extraItems: SurfaceToolbarItems = [
    {
      kind: "select",
      key: "version",
      label: "版本",
      value: String(response?.selectedPolicyVersionId ?? ""),
      options: (response?.policyVersions ?? []).map((version) => ({
        value: String(version.id),
        label: `${version.code} · ${versionCreatedDate(version.createdAt)}`,
      })),
      onChange: setVersionFilter,
    },
    {
      kind: "select",
      key: "category",
      label: "科目类型",
      value: categoryFilter,
      placeholder: "全部",
      options: [
        { value: "asset", label: "资产" },
        { value: "liability", label: "负债" },
        { value: "common", label: "共同" },
        { value: "equity", label: "权益" },
        { value: "cost", label: "成本" },
        { value: "revenue", label: "收入" },
        { value: "expense", label: "费用" },
      ],
      onChange: setCategoryFilter,
    },
    {
      kind: "select",
      key: "review-status",
      label: "复核状态",
      value: reviewStatusFilter,
      placeholder: "全部",
      options: [...REVIEW_STATUS_FILTER_OPTIONS],
      onChange: setReviewStatusFilter,
    },
  ];
  const toolbarItems = useFinanceFilterToolbarItems({
    keyword,
    onKeywordChange: setKeyword,
    showCompanyYear: false,
    showMonth: false,
    showPageSize: false,
    extraItems,
  });
  const treeItems = useMemo(
    () => buildGroupAccountTree(response?.treeRows ?? []),
    [response?.treeRows],
  );
  const treeSelector = {
    kind: "tree" as const,
    title: "集团科目层级",
    items: treeItems,
    selectedId,
    loading,
    loadingText: "加载集团科目...",
    emptyText: error || "没有符合条件的集团科目",
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
    onSelect: (row: FinanceGroupAccountCatalogRow) => {
      void selectGroupAccount(row);
    },
  };

  const detailContent = loading
    ? [createStatusSection("group-account-loading", { kind: "loading", content: "加载集团科目..." })]
    : error
      ? [createStatusSection("group-account-error", { kind: "error", content: error })]
      : selected && editDraft?.id === selected.id
        ? [
            createFieldsSection(
              "group-account-detail",
              selectedVersionIsCurrent && canRevise
                ? groupAccountEditFields(editDraft, setEditDraft)
                : groupAccountDetailFields(selected, businessTimeZone),
              {
              kind: selectedVersionIsCurrent && canRevise ? "fields" : "detail",
              layout: { columns: 2, density: "compact" },
              header: {
                title: `${selected.code} ${selected.name}`,
                description: editDirty ? "有未保存修改" : groupAccountParentDescription(selected),
              },
              actions: [
                ...(canRevise && selectedVersionIsCurrent ? [{
                  key: "save-group-account",
                  action: "save" as const,
                  label: saving ? "保存中..." : "保存",
                  disabled: saving || !editDirty || !editDraft.code.trim()
                    || !editDraft.name.trim() || !editDraft.currency,
                  onClick: () => { void updateGroupAccount(); },
                }] : []),
                ...(canDelete && selectedVersionIsCurrent ? [{
                  key: "delete-group-account",
                  action: "delete" as const,
                  label: "删除集团科目",
                  disabled: saving,
                  onClick: () => { void deleteGroupAccount(selected); },
                }] : []),
                ...(canApprove && selectedVersionIsCurrent && selected.reviewStatus === "pending_review" ? [
                  {
                    key: "approve-group-account-review",
                    action: "approve" as const,
                    label: "复核通过",
                    disabled: saving,
                    onClick: () => { void reviewGroupAccount(selected, "approve"); },
                  },
                  {
                    key: "reject-group-account-review",
                    action: "reject" as const,
                    label: "标记删除",
                    disabled: saving,
                    onClick: () => { void reviewGroupAccount(selected, "reject"); },
                  },
                ] : []),
                ...(canApprove && selectedVersionIsCurrent && selected.reviewStatus === "pending_delete" ? [
                  {
                    key: "approve-group-account-delete",
                    action: "approve" as const,
                    label: "批准删除",
                    disabled: saving,
                    onClick: () => { void reviewGroupAccount(selected, "approve"); },
                  },
                  {
                    key: "restore-group-account",
                    action: "reject" as const,
                    label: "恢复",
                    disabled: saving,
                    onClick: () => { void reviewGroupAccount(selected, "reject"); },
                  },
                ] : []),
              ],
            }),
            ...mappedAccountSections(
              selected,
              mappedRowsByGroup[selected.id],
              mappingDetailState[selected.id],
            ),
          ]
        : [createEmptySection("group-account-empty", {
            content: "从左侧选择集团科目查看详情",
            presentation: "card",
          })];
  const createSections = canRevise && selectedVersionIsCurrent ? [{
      key: "group-account-create",
      body: { kind: "create" as const, create: {
        id: "finance-group-account-catalog-create",
        trigger: "toolbar" as const,
        presentation: "block" as const,
        title: "新增集团科目",
        open: createDraft !== null,
        canCreate: canRevise && selectedVersionIsCurrent,
        disabled: saving,
        content: {
          kind: "sections" as const,
          sections: groupAccountCatalogCreateSections(
            createDraft ?? emptyGroupAccountCatalogCreateDraft(),
            (change) => setCreateDraft((current) => current ? { ...current, ...change } : null),
          ),
        },
        submission: {
          action: "save" as const,
          disabled: saving || !createDraft?.code.trim() || !createDraft?.name.trim() || !createDraft.currency,
          execute: createGroupAccount,
        },
        onOpenChange: (open: boolean) => setCreateDraft(open ? emptyGroupAccountCatalogCreateDraft() : null),
        onCancel: () => setCreateDraft(null),
      } },
    }] : [];
  const sections = [
    ...lifecycleBlocks,
    ...createSections,
    ...detailContent,
  ];

  return (
    <PageSurface
      kind="standard"
      tabbar={navigation}
      toolbar={{ items: toolbarItems }}
      body={createMasterDetailBody({
        master: { label: "集团科目层级", presentation: "compact", body: { kind: "selector", selector: treeSelector } },
        detail: createPageBody(sections),
        desktop: { ratio: [1, 2] },
        mobile: { detailActive: selected !== null },
      })}
    />
  );
}

function groupAccountEditFields(
  draft: GroupAccountCatalogEditDraft,
  setDraft: Dispatch<SetStateAction<GroupAccountCatalogEditDraft | null>>,
) {
  return groupAccountCatalogEditSections(
    draft,
    (change) => setDraft((current) => current ? { ...current, ...change } : null),
  ).flatMap((section) => section.items);
}

function sameGroupAccountDraft(left: GroupAccountCatalogEditDraft, right: GroupAccountCatalogEditDraft) {
  return left.code === right.code
    && left.name === right.name
    && left.category === right.category
    && left.balanceDirection === right.balanceDirection
    && left.currency === right.currency
    && left.parentGroupAccountId === right.parentGroupAccountId
    && left.expectedUpdatedAt === right.expectedUpdatedAt;
}
