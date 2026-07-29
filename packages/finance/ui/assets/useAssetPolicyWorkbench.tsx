"use client";

import { useEffect, useMemo, useState } from "react";
import { matchSearchFields } from "@workspace/platform/search";
import {
  createEmptySection,
  createFieldsSection,
  createMasterDetailBody,
  createPageBody,
  createStatusSection,
  useFeedback,
  type BodySurfaceSectionSpec,
  type FormSurfaceSectionSpec,
  type SelectorSurfaceProps,
} from "@workspace/core/ui";
import type {
  FinanceAssetCategoryDto,
  FinanceAssetWorkspaceDto,
  DeleteFinanceAssetCategoryPolicyInput,
  UpdateFinanceAssetCategoryPolicyInput,
} from "../../types/assets";
import type { AssetPolicyScope } from "./asset-location";
import { KIND_LABELS } from "./assetScheduleUi";
import { assetPolicyFormSections, editAssetPolicyDraft } from "./assetPolicyUi";

export function useAssetPolicyWorkbench(input: {
  canUpdate: boolean;
  policyScope: AssetPolicyScope;
  companyCode: string;
  year: string;
  keyword: string;
  workspace: FinanceAssetWorkspaceDto | null;
  loading: boolean;
  error: string | null;
  lifecycleBlocks: BodySurfaceSectionSpec[];
  savePolicy: (draft: UpdateFinanceAssetCategoryPolicyInput) => Promise<FinanceAssetWorkspaceDto | null>;
  resetPolicy: (input: DeleteFinanceAssetCategoryPolicyInput) => Promise<FinanceAssetWorkspaceDto | null>;
}) {
  const { canUpdate, policyScope, companyCode, year, keyword, workspace, loading, error, lifecycleBlocks, savePolicy: persistPolicy, resetPolicy: persistResetPolicy } = input;
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [draft, setDraft] = useState<UpdateFinanceAssetCategoryPolicyInput | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const feedback = useFeedback({ unsavedChanges: dirty });
  const numericYear = Number(year);
  const scopedWorkspace = workspace?.scope.companyCode === companyCode && workspace.scope.year === numericYear
    ? workspace
    : null;
  const targetCompanyCode = policyScope === "group" ? scopedWorkspace?.policyGroup.companyCode ?? "" : companyCode;
  const policyCategories = useMemo(() => policyScope === "group"
    ? scopedWorkspace?.policyGroup.categories ?? []
    : scopedWorkspace?.policyGroup.companyCode === companyCode ? [] : scopedWorkspace?.categories ?? [],
  [companyCode, policyScope, scopedWorkspace]);
  const categories = useMemo(() => policyCategories.filter((row) => (
    matchSearchFields(row, keyword, ["code", "name", "assetAccountCode", "assetAccountName"])
  )), [keyword, policyCategories]);
  const selectedCategory = policyCategories.find((category) => category.id === selectedCategoryId) ?? null;

  useEffect(() => {
    if (!scopedWorkspace) {
      setSelectedCategoryId(null);
      setDraft(null);
      setDetailOpen(false);
      setDirty(false);
      return;
    }
    if (dirty) return;
    const next = policyCategories.find((category) => category.id === selectedCategoryId)
      ?? policyCategories[0]
      ?? null;
    setSelectedCategoryId(next?.id ?? null);
    setDraft(next ? editAssetPolicyDraft(next, targetCompanyCode, numericYear, policyScope) : null);
  }, [dirty, numericYear, policyCategories, policyScope, scopedWorkspace, selectedCategoryId, targetCompanyCode]);

  async function savePolicy() {
    if (!draft) return;
    setSaving(true);
    try {
      const refreshed = await persistPolicy(draft);
      if (!refreshed) return;
      const refreshedCategories = policyScope === "group" ? refreshed.policyGroup.categories : refreshed.categories;
      const updated = refreshedCategories.find((category) => category.id === draft.categoryId) ?? null;
      setSelectedCategoryId(updated?.id ?? draft.categoryId);
      setDraft(updated ? editAssetPolicyDraft(updated, targetCompanyCode, numericYear, policyScope) : null);
      setDirty(false);
      feedback.success(policyScope === "group" ? "集团核算政策已保存；未单设政策的公司自动继承" : "公司特例政策已保存；既有资产卡片不会自动改写");
    } catch (caught) {
      feedback.error(caught instanceof Error ? caught.message : "核算政策保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function resetToGroupPolicy() {
    if (!selectedCategory || selectedCategory.policySource !== "company_override") return;
    const confirmed = await feedback.confirmDelete({ message: `确定删除“${selectedCategory.name}”的公司特例并恢复继承集团政策吗？既有资产卡片不会改写。` });
    if (!confirmed) return;
    setSaving(true);
    try {
      const refreshed = await persistResetPolicy({
        companyCode,
        year: numericYear,
        categoryId: selectedCategory.id,
        version: selectedCategory.companyPolicyVersion,
      });
      if (!refreshed) return;
      const updated = refreshed.categories.find((category) => category.id === selectedCategory.id) ?? null;
      setSelectedCategoryId(updated?.id ?? selectedCategory.id);
      setDraft(updated ? editAssetPolicyDraft(updated, companyCode, numericYear, "company") : null);
      setDirty(false);
      feedback.success("公司特例已删除，现已继承集团政策");
    } catch (caught) {
      feedback.error(caught instanceof Error ? caught.message : "恢复集团政策失败");
    } finally {
      setSaving(false);
    }
  }

  async function selectCategory(category: FinanceAssetCategoryDto) {
    if (category.id === selectedCategoryId) {
      setDetailOpen(true);
      return;
    }
    if (dirty && !await feedback.confirmLeave()) return;
    setSelectedCategoryId(category.id);
    setDraft(editAssetPolicyDraft(category, targetCompanyCode, numericYear, policyScope));
    setDirty(false);
    setDetailOpen(true);
  }

  function updateDraft(key: keyof UpdateFinanceAssetCategoryPolicyInput, value: unknown) {
    if (!canUpdate) return;
    setDraft((current) => current ? { ...current, [key]: value } as UpdateFinanceAssetCategoryPolicyInput : null);
    setDirty(true);
  }

  function resetDraft() {
    if (!selectedCategory) return;
    setDraft(editAssetPolicyDraft(selectedCategory, targetCompanyCode, numericYear, policyScope));
    setDirty(false);
  }

  const selector: SelectorSurfaceProps<FinanceAssetCategoryDto> = {
    kind: "list",
    title: policyScope === "group" ? "集团政策" : "公司政策",
    selectedId: selectedCategoryId,
    loading,
    loadingText: "正在加载核算政策",
    emptyText: error ? `加载失败：${error}` : scopedWorkspace
      ? policyScope === "company" && scopedWorkspace.policyGroup.companyCode === companyCode
        ? "母公司不单设公司政策，请在集团页维护"
        : "暂无资产分类"
      : "请选择公司和年度",
    items: categories.map((category) => ({
      key: category.id,
      value: category,
      group: KIND_LABELS[category.assetKind],
      card: {
        title: category.name,
        code: category.code,
        subtitle: accountPolicySummary(category),
        metaLine: category.reviewRequired ? "录入前复核" : "按规则直接录入",
        status: policyStatus(category, policyScope),
        tone: "amber",
      },
    })),
    onSelect: (category) => { void selectCategory(category); },
  };
  const detailSections = [
    ...lifecycleBlocks,
    ...(loading
      ? [createStatusSection("asset-policy-loading", { kind: "loading", content: "正在加载核算政策" })]
      : error
        ? [createStatusSection("asset-policy-error", { kind: "error", content: error })]
        : [detailSection()]),
  ];

  return {
    total: categories.length,
    body: createMasterDetailBody({
      master: { label: policyScope === "group" ? "集团政策" : "公司政策", presentation: "compact", body: { kind: "selector", selector } },
      detail: createPageBody(detailSections),
      desktop: { ratio: [1, 2] },
      mobile: { detailActive: detailOpen, onNavigateToList: () => setDetailOpen(false) },
    }),
  };

  function detailSection(): BodySurfaceSectionSpec {
    if (!selectedCategory || !draft) {
      return createEmptySection("asset-policy-empty", { content: "从左侧选择资产分类查看政策", presentation: "card" });
    }
    const formSections = assetPolicyFormSections({
      category: selectedCategory,
      draft,
      readOnly: !canUpdate,
      onChange: updateDraft,
    }).map<FormSurfaceSectionSpec>((section) => ({ kind: "section", ...section, chrome: "divider" }));
    const persisted = policyScope === "group" ? selectedCategory.policySource === "group" : selectedCategory.policySource === "company_override";
    return createFieldsSection("asset-policy-detail", formSections, {
      kind: canUpdate ? "fields" : "detail",
      header: {
        title: selectedCategory.name,
        description: policyDescription(selectedCategory, policyScope, scopedWorkspace?.policyGroup.companyName ?? "集团"),
      },
      actions: canUpdate ? [
        ...(policyScope === "company" && selectedCategory.policySource === "company_override"
          ? [{ key: "inherit", action: "delete" as const, label: "恢复集团默认", disabled: saving, onClick: () => void resetToGroupPolicy() }]
          : []),
        { key: "reset", action: "reset", label: "撤销修改", disabled: saving || !dirty, onClick: resetDraft },
        { key: "save", action: "save", label: saving ? "保存中..." : !persisted && policyScope === "company" ? "另存为公司政策" : !persisted ? "确认集团政策" : "保存", disabled: saving || (persisted && !dirty) || !policyDraftComplete(draft, selectedCategory), onClick: () => void savePolicy() },
      ] : [],
      submit: canUpdate ? { onSubmit: () => void savePolicy() } : undefined,
    });
  }
}

function policyStatus(category: FinanceAssetCategoryDto, scope: AssetPolicyScope) {
  if (scope === "group") return category.policySource === "group"
    ? { label: "集团政策", tone: "success" as const }
    : { label: "待确认", tone: "warning" as const };
  if (category.policySource === "company_override") return { label: "单独设置", tone: "success" as const };
  if (category.policySource === "group") return category.policyMappingIssue
    ? { label: "需单设", tone: "warning" as const }
    : { label: "继承集团", tone: "muted" as const };
  return { label: "集团待确认", tone: "warning" as const };
}

function policyDescription(category: FinanceAssetCategoryDto, scope: AssetPolicyScope, groupName: string) {
  const kind = KIND_LABELS[category.assetKind];
  if (scope === "group") return `${kind} · ${category.policySource === "group" ? `${groupName}集团默认` : "系统预置，确认后作为集团默认"}`;
  if (category.policySource === "company_override") return `${kind} · 当前公司单独设置`;
  return `${kind} · 继承${groupName}集团政策${category.policyMappingIssue ? `；${category.policyMappingIssue}` : ""}`;
}

function accountPolicySummary(category: FinanceAssetCategoryDto) {
  const asset = category.assetAccountCode ?? "未匹配资产科目";
  return category.accumulatedAccountCode ? `${asset} / ${category.accumulatedAccountCode}` : asset;
}

function policyDraftComplete(draft: UpdateFinanceAssetCategoryPolicyInput, category: FinanceAssetCategoryDto) {
  const accumulatedRequired = category.assetKind === "fixed_asset" || category.assetKind === "intangible";
  return Boolean(
    draft.companyCode
    && draft.year
    && draft.categoryId
    && draft.assetAccountId
    && (!accumulatedRequired || draft.accumulatedAccountId)
    && (!category.depreciable || draft.expenseAccountId)
    && draft.classificationRule.trim()
  );
}
