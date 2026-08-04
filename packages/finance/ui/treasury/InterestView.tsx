"use client";

import { useEffect, useState } from "react";
import {
  createEmptySection,
  createFieldsSection,
  createMasterDetailBody,
  createMessageSection,
  createPageBody,
  useFeedback,
  type PageSurfaceCreateSpec,
  type SelectorSurfaceProps,
} from "@workspace/core/ui";
import type { TreasuryInterestWorkpaperDto } from "../../types/treasury";
import { asFormItems, interestSections } from "./treasury-forms";
import {
  canSaveInterest,
  editInterestDraft,
  emptyInterestDraft,
  formatAmount,
  statusTone,
  treasuryStatusLabel,
  uniqueLoanConvention,
  type InterestWorkpaperDraft,
} from "./treasury-model";
import type { TreasuryViewProps } from "./treasury-view-types";

export function useInterestView({ workspace, canCreate, canUpdate, mutate, targetEntityId }: TreasuryViewProps) {
  const [selectedId, setSelectedId] = useState<number | null>(() => targetEntityId ?? workspace.interestWorkpapers[0]?.id ?? null);
  const [draft, setDraft] = useState<InterestWorkpaperDraft | null>(() => (
    workspace.interestWorkpapers[0] ? editInterestDraft(workspace.scope, workspace.interestWorkpapers[0]) : null
  ));
  const [createDraft, setCreateDraft] = useState<InterestWorkpaperDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const feedback = useFeedback({ unsavedChanges: dirty });
  const selected = workspace.interestWorkpapers.find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    if (dirty) return;
    const next = workspace.interestWorkpapers.find((row) => row.id === selectedId) ?? workspace.interestWorkpapers[0] ?? null;
    setSelectedId(next?.id ?? null);
    setDraft(next ? editInterestDraft(workspace.scope, next) : null);
  }, [dirty, selectedId, workspace]);

  useEffect(() => {
    if (!targetEntityId || dirty) return;
    const target = workspace.interestWorkpapers.find((row) => row.id === targetEntityId);
    if (!target) return;
    setSelectedId(target.id);
    setDraft(editInterestDraft(workspace.scope, target));
  }, [dirty, targetEntityId, workspace]);

  const selector: SelectorSurfaceProps<TreasuryInterestWorkpaperDto> = {
    kind: "list",
    title: "利息底稿",
    selectedId,
    emptyText: "当前期间暂无利息底稿",
    items: workspace.interestWorkpapers.map((row) => ({
      key: row.id,
      value: row,
      card: {
        title: loanName(row.loanId),
        code: "利息工作底稿",
        subtitle: `计算 ${formatAmount(row.calculation.calculatedAmount)} · 凭证 ${formatAmount(row.calculation.voucherAmount)}`,
        metaLine: `凭证差额 ${formatAmount(row.calculation.voucherDifference)}${row.calculation.sourceDifference == null ? "" : ` · 来源差额 ${formatAmount(row.calculation.sourceDifference)}`}`,
        status: { label: treasuryStatusLabel(row.status), tone: statusTone(row.status) },
        tone: hasDifference(row) ? "amber" : "emerald",
      },
    })),
    onSelect: (row) => { void selectRow(row); },
  };

  const create = createSpec();
  const body = createMasterDetailBody({
    master: { label: "利息底稿", presentation: "compact", body: { kind: "selector", selector } },
    detail: createPageBody(detailSections()),
    desktop: { ratio: [1, 2] },
  });
  return { body, create };

  function loanName(id: number) {
    const loan = workspace.loans.find((item) => item.id === id);
    return loan ? `${loan.loanNo} · ${loan.name}` : "未识别借款合同";
  }

  function createSpec(): PageSurfaceCreateSpec {
    const firstLoan = workspace.loans.find((loan) => uniqueLoanConvention(loan)) ?? null;
    const current = createDraft ?? emptyInterestDraft(workspace.scope, firstLoan);
    const unavailable = !workspace.scope.periodId || workspace.scope.isClosed || !firstLoan;
    return {
          id: "treasury-interest-create",
          presentation: "block",
          title: "新建利息底稿",
          open: Boolean(createDraft),
          canCreate,
          disabled: saving || unavailable,
          content: { kind: "sections", sections: interestSections(current, updateCreateDraft, workspace.loans) },
          submission: {
            action: "save",
            disabled: saving || !createDraft || !canSaveInterest(createDraft),
            execute: async () => {
              if (!createDraft) return;
              const created = await mutate<TreasuryInterestWorkpaperDto>("POST", { kind: "interest_workpaper_create", ...createDraft });
              setSelectedId(created.id);
              setDraft(editInterestDraft(workspace.scope, created));
              setDirty(false);
              setCreateDraft(null);
              return { outcome: "saved" as const, message: "利息底稿已创建" };
            },
          },
          onOpenChange: (open) => setCreateDraft(open ? emptyInterestDraft(workspace.scope, firstLoan) : null),
          onCancel: () => setCreateDraft(null),
    };
  }

  function detailSections() {
    if (!selected || !draft) return [createEmptySection("interest-empty", { content: emptyText(), presentation: "card" })];
    return [
      createMessageSection("interest-calculation", {
        tone: hasDifference(selected) ? "warning" : "success",
        content: `计算利息 ${formatAmount(selected.calculation.calculatedAmount)}；凭证金额 ${formatAmount(selected.calculation.voucherAmount)}；凭证差额 ${formatAmount(selected.calculation.voucherDifference)}${selected.calculation.sourceDifference == null ? "" : `；来源差额 ${formatAmount(selected.calculation.sourceDifference)}`}`,
      }),
      createFieldsSection("interest-detail", asFormItems(interestSections(draft, updateDraft, workspace.loans, !canUpdate, voucherItemNames(selected), lineCalculatedAmounts(selected))), {
        kind: canUpdate ? "fields" : "detail",
        header: { title: loanName(selected.loanId), description: "利息工作底稿" },
        actions: canUpdate ? [
          { key: "reset", action: "reset", label: "撤销修改", disabled: saving || !dirty, onClick: resetDraft },
          { key: "save", action: "save", label: saving ? "保存中..." : "保存", disabled: saving || workspace.scope.isClosed || !dirty || !canSaveInterest(draft), onClick: () => void save() },
        ] : [],
        submit: canUpdate ? { onSubmit: () => void save() } : undefined,
      }),
    ];
  }

  function voucherItemNames(row: TreasuryInterestWorkpaperDto) {
    return Object.fromEntries(row.voucherLinks.flatMap((link) => link.voucherItemName ? [[link.voucherItemId, link.voucherItemName]] : []));
  }

  function lineCalculatedAmounts(row: TreasuryInterestWorkpaperDto) {
    return Object.fromEntries(row.lines.map((line) => [line.id, line.calculatedAmount]));
  }

  function emptyText() {
    if (!workspace.scope.periodId) return "当前会计期间不存在，无法维护利息底稿";
    if (workspace.loans.length === 0) return "请先维护借款合同";
    if (!workspace.loans.some((loan) => uniqueLoanConvention(loan))) return "借款合同计息天数口径不唯一，需先修正利率条款";
    return "新建利息底稿，或从左侧选择记录";
  }

  function updateDraft(update: (current: InterestWorkpaperDraft) => InterestWorkpaperDraft) {
    if (!canUpdate) return;
    setDraft((current) => current ? update(current) : current);
    setDirty(true);
  }

  function updateCreateDraft(update: (current: InterestWorkpaperDraft) => InterestWorkpaperDraft) {
    const firstLoan = workspace.loans.find((loan) => uniqueLoanConvention(loan)) ?? null;
    setCreateDraft((current) => update(current ?? emptyInterestDraft(workspace.scope, firstLoan)));
  }

  async function selectRow(row: TreasuryInterestWorkpaperDto) {
    if (row.id !== selectedId && dirty && !await feedback.confirmLeave()) return;
    setSelectedId(row.id);
    setDraft(editInterestDraft(workspace.scope, row));
    setDirty(false);
  }

  function resetDraft() {
    if (!selected) return;
    setDraft(editInterestDraft(workspace.scope, selected));
    setDirty(false);
  }

  async function save() {
    if (!selected || !draft || !canUpdate) return;
    setSaving(true);
    try {
      const updated = await mutate<TreasuryInterestWorkpaperDto>("PUT", {
        kind: "interest_workpaper_update",
        id: selected.id,
        version: selected.version,
        ...draft,
      });
      setSelectedId(updated.id);
      setDraft(editInterestDraft(workspace.scope, updated));
      setDirty(false);
      feedback.success("利息底稿已更新");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "利息底稿更新失败");
    } finally {
      setSaving(false);
    }
  }
}

function hasDifference(row: TreasuryInterestWorkpaperDto) {
  return Math.abs(row.calculation.voucherDifference) > 0.01
    || (row.calculation.sourceDifference != null && Math.abs(row.calculation.sourceDifference) > 0.01);
}
