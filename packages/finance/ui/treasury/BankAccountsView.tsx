"use client";

import { useEffect, useState } from "react";
import {
  createEmptySection,
  createFieldsSection,
  createMasterDetailBody,
  createPageBody,
  useFeedback,
  type PageSurfaceCreateSpec,
  type SelectorSurfaceProps,
} from "@workspace/core/ui";
import type { TreasuryBankAccountDto } from "../../types/treasury";
import { asFormItems, bankAccountSections } from "./treasury-forms";
import {
  canSaveBankAccount,
  editBankAccountDraft,
  emptyBankAccountDraft,
  type BankAccountDraft,
} from "./treasury-model";
import { randomToken, type TreasuryViewProps } from "./treasury-view-types";

export function useBankAccountsView({ workspace, canCreate, canUpdate, mutate }: TreasuryViewProps) {
  const [selectedId, setSelectedId] = useState<number | null>(workspace.bankAccounts[0]?.id ?? null);
  const [draft, setDraft] = useState<BankAccountDraft | null>(() => (
    workspace.bankAccounts[0] ? editBankAccountDraft(workspace.bankAccounts[0]) : null
  ));
  const [createDraft, setCreateDraft] = useState<BankAccountDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const feedback = useFeedback({ unsavedChanges: dirty });
  const selected = workspace.bankAccounts.find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    if (dirty) return;
    const next = workspace.bankAccounts.find((row) => row.id === selectedId) ?? workspace.bankAccounts[0] ?? null;
    setSelectedId(next?.id ?? null);
    setDraft(next ? editBankAccountDraft(next) : null);
  }, [dirty, selectedId, workspace.bankAccounts]);

  const selector: SelectorSurfaceProps<TreasuryBankAccountDto> = {
    kind: "list",
    title: "银行账户",
    selectedId,
    emptyText: "当前公司暂无银行账户",
    items: workspace.bankAccounts.map((account) => ({
      key: account.id,
      value: account,
      card: {
        title: account.sourceName,
        code: account.accountNo ?? account.sourceCode ?? "未设置账号标识",
        subtitle: [account.bankName, account.currencyCode].filter(Boolean).join(" · ") || "未补充开户行与币种",
        metaLine: account.accountId ? `关联科目 ${[account.accountCode, account.accountName].filter(Boolean).join(" · ") || "名称待补"}` : "未关联总账科目",
        status: { label: account.isActive ? "启用" : "停用", tone: account.isActive ? "success" : "muted" },
        tone: "emerald",
      },
    })),
    onSelect: (account) => { void selectAccount(account); },
  };

  const create = createSpec();
  const body = createMasterDetailBody({
    master: { label: "银行账户", presentation: "compact", body: { kind: "selector", selector } },
    detail: createPageBody([detailSection()]),
    desktop: { ratio: [1, 2] },
  });
  return { body, create };

  function createSpec(): PageSurfaceCreateSpec {
    const current = createDraft ?? emptyBankAccountDraft(workspace.scope, randomToken());
    return {
          id: "treasury-bank-account-create",
          presentation: "block",
          title: "新建银行账户",
          open: Boolean(createDraft),
          canCreate,
          disabled: saving,
          content: { kind: "sections", sections: bankAccountSections(current, updateCreateDraft) },
          submission: {
            action: "save",
            disabled: saving || !createDraft || !canSaveBankAccount(createDraft),
            execute: async () => {
              if (!createDraft) return;
              const created = await mutate<TreasuryBankAccountDto>("POST", { kind: "bank_account_create", ...createDraft });
              setSelectedId(created.id);
              setDraft(editBankAccountDraft(created));
              setDirty(false);
              setCreateDraft(null);
              return { outcome: "saved" as const, message: "银行账户已创建" };
            },
          },
          onOpenChange: (open) => setCreateDraft(open ? emptyBankAccountDraft(workspace.scope, randomToken()) : null),
          onCancel: () => setCreateDraft(null),
    };
  }

  function detailSection() {
    if (!selected || !draft) return createEmptySection("bank-account-empty", { content: "新建银行账户，或从左侧选择记录", presentation: "card" });
    return createFieldsSection("bank-account-detail", asFormItems(bankAccountSections(draft, updateDraft, !canUpdate, selected.accountName)), {
      kind: canUpdate ? "fields" : "detail",
      header: {
        title: selected.sourceName,
        description: selected.bankName ?? "未填写开户行",
      },
      actions: canUpdate ? [
        { key: "reset", action: "reset", label: "撤销修改", disabled: saving || !dirty, onClick: resetDraft },
        { key: "save", action: "save", label: saving ? "保存中..." : "保存", disabled: saving || !dirty || !canSaveBankAccount(draft), onClick: () => void save() },
      ] : [],
      submit: canUpdate ? { onSubmit: () => void save() } : undefined,
    });
  }

  function updateDraft(update: (current: BankAccountDraft) => BankAccountDraft) {
    if (!canUpdate) return;
    setDraft((current) => current ? update(current) : current);
    setDirty(true);
  }

  function updateCreateDraft(update: (current: BankAccountDraft) => BankAccountDraft) {
    setCreateDraft((current) => update(current ?? emptyBankAccountDraft(workspace.scope, randomToken())));
  }

  async function selectAccount(account: TreasuryBankAccountDto) {
    if (account.id !== selectedId && dirty && !await feedback.confirmLeave()) return;
    setSelectedId(account.id);
    setDraft(editBankAccountDraft(account));
    setDirty(false);
  }

  function resetDraft() {
    if (!selected) return;
    setDraft(editBankAccountDraft(selected));
    setDirty(false);
  }

  async function save() {
    if (!selected || !draft || !canUpdate) return;
    setSaving(true);
    try {
      const updated = await mutate<TreasuryBankAccountDto>("PUT", {
        kind: "bank_account_update",
        id: selected.id,
        version: selected.version,
        ...draft,
      });
      setSelectedId(updated.id);
      setDraft(editBankAccountDraft(updated));
      setDirty(false);
      feedback.success("银行账户已更新");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "银行账户更新失败");
    } finally {
      setSaving(false);
    }
  }
}
