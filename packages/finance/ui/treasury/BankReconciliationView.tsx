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
import type { TreasuryBankReconciliationDto } from "../../types/treasury";
import { asFormItems, reconciliationSections } from "./treasury-forms";
import {
  canSaveReconciliation,
  editReconciliationDraft,
  emptyReconciliationDraft,
  formatAmount,
  statusTone,
  treasuryStatusLabel,
  type ReconciliationDraft,
} from "./treasury-model";
import type { TreasuryViewProps } from "./treasury-view-types";

export function useBankReconciliationView({ workspace, canCreate, canUpdate, mutate, targetEntityId }: TreasuryViewProps) {
  const [selectedId, setSelectedId] = useState<number | null>(() => targetEntityId ?? workspace.bankReconciliations[0]?.id ?? null);
  const [draft, setDraft] = useState<ReconciliationDraft | null>(() => (
    workspace.bankReconciliations[0] ? editReconciliationDraft(workspace.scope, workspace.bankReconciliations[0]) : null
  ));
  const [createDraft, setCreateDraft] = useState<ReconciliationDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const feedback = useFeedback({ unsavedChanges: dirty });
  const selected = workspace.bankReconciliations.find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    if (dirty) return;
    const next = workspace.bankReconciliations.find((row) => row.id === selectedId) ?? workspace.bankReconciliations[0] ?? null;
    setSelectedId(next?.id ?? null);
    setDraft(next ? editReconciliationDraft(workspace.scope, next) : null);
  }, [dirty, selectedId, workspace]);

  useEffect(() => {
    if (!targetEntityId || dirty) return;
    const target = workspace.bankReconciliations.find((row) => row.id === targetEntityId);
    if (!target) return;
    setSelectedId(target.id);
    setDraft(editReconciliationDraft(workspace.scope, target));
  }, [dirty, targetEntityId, workspace]);

  const selector: SelectorSurfaceProps<TreasuryBankReconciliationDto> = {
    kind: "list",
    title: "银行对账",
    selectedId,
    emptyText: "当前期间暂无银行对账记录",
    items: workspace.bankReconciliations.map((row) => ({
      key: row.id,
      value: row,
      card: {
        title: accountName(row.bankAccountId),
        code: row.statementDate,
        subtitle: `银行 ${formatAmount(row.statementEndingBalance)} · 账面 ${formatAmount(row.ledgerEndingBalance)}`,
        metaLine: `调整后差额 ${formatAmount(row.calculation.difference)} · 未达项 ${row.items.length}`,
        status: { label: treasuryStatusLabel(row.status), tone: statusTone(row.status) },
        tone: Math.abs(row.calculation.difference) > 0.01 ? "amber" : "emerald",
      },
    })),
    onSelect: (row) => { void selectRow(row); },
  };

  const create = createSpec();
  const body = createMasterDetailBody({
    master: { label: "银行对账", presentation: "compact", body: { kind: "selector", selector } },
    detail: createPageBody(detailSections()),
    desktop: { ratio: [1, 2] },
  });
  return { body, create };

  function accountName(id: number) {
    const account = workspace.bankAccounts.find((item) => item.id === id);
    return account?.sourceName ?? "未识别银行账户";
  }

  function createSpec(): PageSurfaceCreateSpec {
    const current = createDraft ?? emptyReconciliationDraft(workspace.scope, workspace.bankAccounts[0]?.id ?? null);
    const unavailable = !workspace.scope.periodId || workspace.scope.isClosed || workspace.bankAccounts.length === 0;
    return {
          id: "treasury-bank-reconciliation-create",
          presentation: "block",
          title: "新建银行对账",
          open: Boolean(createDraft),
          canCreate,
          disabled: saving || unavailable,
          content: { kind: "sections", sections: reconciliationSections(current, updateCreateDraft, workspace.bankAccounts) },
          submission: {
            action: "save",
            disabled: saving || !createDraft || !canSaveReconciliation(createDraft),
            execute: async () => {
              if (!createDraft) return;
              const created = await mutate<TreasuryBankReconciliationDto>("POST", { kind: "bank_reconciliation_create", ...createDraft });
              setSelectedId(created.id);
              setDraft(editReconciliationDraft(workspace.scope, created));
              setDirty(false);
              setCreateDraft(null);
              return { outcome: "saved" as const, message: "银行对账已创建" };
            },
          },
          onOpenChange: (open) => setCreateDraft(open ? emptyReconciliationDraft(workspace.scope, workspace.bankAccounts[0]?.id ?? null) : null),
          onCancel: () => setCreateDraft(null),
    };
  }

  function detailSections() {
    if (!selected || !draft) return [createEmptySection("bank-reconciliation-empty", { content: emptyText(), presentation: "card" })];
    return [
      createMessageSection("bank-reconciliation-calculation", {
        tone: Math.abs(selected.calculation.difference) > 0.01 ? "warning" : "success",
        content: `调整后银行余额 ${formatAmount(selected.calculation.adjustedBankBalance)}；调整后账面余额 ${formatAmount(selected.calculation.adjustedLedgerBalance)}；差额 ${formatAmount(selected.calculation.difference)}`,
      }),
      createFieldsSection("bank-reconciliation-detail", asFormItems(reconciliationSections(draft, updateDraft, workspace.bankAccounts, !canUpdate, voucherItemNames(selected))), {
        kind: canUpdate ? "fields" : "detail",
        header: { title: accountName(selected.bankAccountId), description: selected.statementDate },
        actions: canUpdate ? [
          { key: "reset", action: "reset", label: "撤销修改", disabled: saving || !dirty, onClick: resetDraft },
          { key: "save", action: "save", label: saving ? "保存中..." : "保存", disabled: saving || workspace.scope.isClosed || !dirty || !canSaveReconciliation(draft), onClick: () => void save() },
        ] : [],
        submit: canUpdate ? { onSubmit: () => void save() } : undefined,
      }),
    ];
  }

  function voucherItemNames(row: TreasuryBankReconciliationDto) {
    return Object.fromEntries(row.items.flatMap((item) => item.voucherItemId && item.voucherItemName ? [[item.voucherItemId, item.voucherItemName]] : []));
  }

  function emptyText() {
    if (!workspace.scope.periodId) return "当前会计期间不存在，无法维护银行对账";
    if (workspace.bankAccounts.length === 0) return "请先维护银行账户";
    return "新建银行对账，或从左侧选择记录";
  }

  function updateDraft(update: (current: ReconciliationDraft) => ReconciliationDraft) {
    if (!canUpdate) return;
    setDraft((current) => current ? update(current) : current);
    setDirty(true);
  }

  function updateCreateDraft(update: (current: ReconciliationDraft) => ReconciliationDraft) {
    setCreateDraft((current) => update(current ?? emptyReconciliationDraft(workspace.scope, workspace.bankAccounts[0]?.id ?? null)));
  }

  async function selectRow(row: TreasuryBankReconciliationDto) {
    if (row.id !== selectedId && dirty && !await feedback.confirmLeave()) return;
    setSelectedId(row.id);
    setDraft(editReconciliationDraft(workspace.scope, row));
    setDirty(false);
  }

  function resetDraft() {
    if (!selected) return;
    setDraft(editReconciliationDraft(workspace.scope, selected));
    setDirty(false);
  }

  async function save() {
    if (!selected || !draft || !canUpdate) return;
    setSaving(true);
    try {
      const updated = await mutate<TreasuryBankReconciliationDto>("PUT", {
        kind: "bank_reconciliation_update",
        id: selected.id,
        version: selected.version,
        ...draft,
      });
      setSelectedId(updated.id);
      setDraft(editReconciliationDraft(workspace.scope, updated));
      setDirty(false);
      feedback.success("银行对账已更新");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "银行对账更新失败");
    } finally {
      setSaving(false);
    }
  }
}
