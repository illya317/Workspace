"use client";

import { useEffect, useState } from "react";
import {
  createEmptySection,
  createFieldsSection,
  createMasterDetailBody,
  createMessageSection,
  createPageBody,
  useFeedback,
  type BodySurfaceSectionSpec,
  type PageSurfaceCreateSpec,
  type SelectorSurfaceProps,
} from "@workspace/core/ui";
import type { TreasuryLoanDto, TreasuryPrincipalEventDto } from "../../types/treasury";
import { asFormItems, loanSections, principalEventSections } from "./treasury-forms";
import {
  canAppendPrincipalEvent,
  canSaveLoan,
  editLoanDraft,
  emptyLoanDraft,
  emptyPrincipalEventDraft,
  formatAmount,
  statusTone,
  treasuryStatusLabel,
  type LoanDraft,
  type PrincipalEventDraft,
} from "./treasury-model";
import { randomToken, type TreasuryViewProps } from "./treasury-view-types";

export function useLoansView({ workspace, canCreate, canUpdate, mutate }: TreasuryViewProps) {
  const [selectedId, setSelectedId] = useState<number | null>(workspace.loans[0]?.id ?? null);
  const [draft, setDraft] = useState<LoanDraft | null>(() => workspace.loans[0] ? editLoanDraft(workspace.loans[0]) : null);
  const [createDraft, setCreateDraft] = useState<LoanDraft | null>(null);
  const [eventDraft, setEventDraft] = useState<PrincipalEventDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const feedback = useFeedback({ unsavedChanges: dirty });
  const selected = workspace.loans.find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    if (dirty) return;
    const next = workspace.loans.find((row) => row.id === selectedId) ?? workspace.loans[0] ?? null;
    setSelectedId(next?.id ?? null);
    setDraft(next ? editLoanDraft(next) : null);
  }, [dirty, selectedId, workspace.loans]);

  const selector: SelectorSurfaceProps<TreasuryLoanDto> = {
    kind: "list",
    title: "借款合同",
    selectedId,
    emptyText: "当前公司暂无借款合同",
    items: workspace.loans.map((loan) => ({
      key: loan.id,
      value: loan,
      card: {
        title: loan.name,
        code: loan.loanNo,
        subtitle: `${loan.currencyCode} · 合同本金 ${formatAmount(loan.contractPrincipalAmount)}`,
        metaLine: `本金余额 ${formatAmount(loan.principalBalance)} · ${loan.rateTerms.length} 条利率条款`,
        status: { label: treasuryStatusLabel(loan.status), tone: statusTone(loan.status) },
        tone: "amber",
      },
    })),
    onSelect: (loan) => { void selectLoan(loan); },
  };

  const create = createSpec();
  const body = createMasterDetailBody({
    master: { label: "借款合同", presentation: "compact", body: { kind: "selector", selector } },
    detail: createPageBody(detailSections()),
    desktop: { ratio: [1, 2] },
  });
  return { body, create };

  function createSpec(): PageSurfaceCreateSpec {
    const current = createDraft ?? emptyLoanDraft(workspace.scope, randomToken());
    return {
          id: "treasury-loan-create",
          presentation: "block",
          title: "新建借款合同",
          open: Boolean(createDraft),
          canCreate,
          disabled: saving,
          content: { kind: "sections", sections: loanSections(current, updateCreateDraft) },
          submission: {
            action: "save",
            disabled: saving || !createDraft || !canSaveLoan(createDraft),
            execute: async () => {
              if (!createDraft) return;
              const created = await mutate<TreasuryLoanDto>("POST", { kind: "loan_create", ...createDraft });
              setSelectedId(created.id);
              setDraft(editLoanDraft(created));
              setDirty(false);
              setCreateDraft(null);
              return { outcome: "saved" as const, message: "借款合同已创建" };
            },
          },
          onOpenChange: (open) => setCreateDraft(open ? emptyLoanDraft(workspace.scope, randomToken()) : null),
          onCancel: () => setCreateDraft(null),
    };
  }

  function detailSections() {
    if (!selected || !draft) return [createEmptySection("loan-empty", { content: "新建借款合同，或从左侧选择记录", presentation: "card" })];
    return [
      createMessageSection("loan-balance", {
        tone: selected.principalBalance < 0 ? "warning" : "muted",
        content: `合同本金 ${formatAmount(selected.contractPrincipalAmount)}；当前本金余额 ${formatAmount(selected.principalBalance)}；本金事件 ${selected.principalEvents.length} 条`,
      }),
      principalEventSection(selected),
      createFieldsSection("loan-detail", asFormItems(loanSections(draft, updateDraft, !canUpdate, selected.lenderPartyName)), {
        kind: canUpdate ? "fields" : "detail",
        header: { title: selected.name, description: selected.loanNo },
        actions: canUpdate ? [
          { key: "reset", action: "reset", label: "撤销修改", disabled: saving || !dirty, onClick: resetDraft },
          { key: "save", action: "save", label: saving ? "保存中..." : "保存", disabled: saving || !dirty || !canSaveLoan(draft), onClick: () => void save() },
        ] : [],
        submit: canUpdate ? { onSubmit: () => void save() } : undefined,
      }),
    ];
  }

  function principalEventSection(loan: TreasuryLoanDto): BodySurfaceSectionSpec {
    const current = eventDraft ?? emptyPrincipalEventDraft(workspace.scope, loan.id, randomToken());
    return {
      key: "principal-event-create",
      body: {
        kind: "create",
        create: {
          id: "treasury-principal-event-create",
          trigger: "surface",
          presentation: "modal",
          title: "记录本金变动",
          open: Boolean(eventDraft),
          canCreate,
          disabled: saving || !workspace.scope.periodId || workspace.scope.isClosed,
          content: { kind: "sections", sections: principalEventSections(current, updateEventDraft, loan) },
          submission: {
            action: "save",
            disabled: saving || !eventDraft || !canAppendPrincipalEvent(workspace.scope, eventDraft),
            execute: async () => {
              if (!eventDraft) return;
              await mutate<TreasuryPrincipalEventDto>("POST", { kind: "principal_event_append", ...eventDraft });
              setEventDraft(null);
              return { outcome: "saved" as const, message: "本金变动已记录" };
            },
          },
          onOpenChange: (open) => setEventDraft(open ? emptyPrincipalEventDraft(workspace.scope, loan.id, randomToken()) : null),
          onCancel: () => setEventDraft(null),
        },
      },
    };
  }

  function updateDraft(update: (current: LoanDraft) => LoanDraft) {
    if (!canUpdate) return;
    setDraft((current) => current ? update(current) : current);
    setDirty(true);
  }

  function updateCreateDraft(update: (current: LoanDraft) => LoanDraft) {
    setCreateDraft((current) => update(current ?? emptyLoanDraft(workspace.scope, randomToken())));
  }

  function updateEventDraft(update: (current: PrincipalEventDraft) => PrincipalEventDraft) {
    if (!selected) return;
    setEventDraft((current) => update(current ?? emptyPrincipalEventDraft(workspace.scope, selected.id, randomToken())));
  }

  async function selectLoan(loan: TreasuryLoanDto) {
    if (loan.id !== selectedId && dirty && !await feedback.confirmLeave()) return;
    setSelectedId(loan.id);
    setDraft(editLoanDraft(loan));
    setDirty(false);
    setEventDraft(null);
  }

  function resetDraft() {
    if (!selected) return;
    setDraft(editLoanDraft(selected));
    setDirty(false);
  }

  async function save() {
    if (!selected || !draft || !canUpdate) return;
    setSaving(true);
    try {
      const updated = await mutate<TreasuryLoanDto>("PUT", {
        kind: "loan_update",
        id: selected.id,
        version: selected.version,
        ...draft,
      });
      setSelectedId(updated.id);
      setDraft(editLoanDraft(updated));
      setDirty(false);
      feedback.success("借款合同已更新");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "借款合同更新失败");
    } finally {
      setSaving(false);
    }
  }
}
