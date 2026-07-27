"use client";
import { useEffect, useMemo, useRef, useState } from "react";

import { type BodySurfaceSectionCreateSpec, type BodySurfaceSectionSpec, type FormSurfaceItemSpec, useFeedback } from "@workspace/core/ui";
import { HR_EMPLOYMENT_AGREEMENT_TEMPORAL } from "@workspace/hr/business-temporal";
import { contractFields, withTenantProfileFieldOptions } from "@workspace/hr/constants";
import type { EmploymentAgreementCommandKind } from "@workspace/hr/employment-agreement-field-contract";
import type { ContractRow, EmploymentRow } from "@workspace/hr/types";
import { employmentForAgreementDate } from "@workspace/hr/utils/employment-selection";
import { requestJson } from "@workspace/platform/ui/api-client";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";
import { uniqueContractMissingLabels } from "./EmployeeProfileContractView";
import { useEmployeeAgreementAttachmentItems } from "./EmployeeAgreementAttachmentSection";
import {
  agreementContentFieldsByMissingState,
  agreementContentPatch,
  agreementDetailItems,
  agreementHistorySupplemental,
  agreementMasterSections,
  applyAgreement,
  createAgreementItems,
  emptyAgreementDraft,
  initialDraft,
  termCommandItems,
  termKindForCommand,
  type AgreementCommandKind,
  type AgreementDraft,
} from "./EmployeeProfileContractForm";

type AgreementEditMode = "create" | "correct" | null;

export function useContractSections({
  employeeId,
  employments,
  rows,
  asOfDate,
  canEdit,
  onSaved,
}: {
  employeeId: number;
  employments: EmploymentRow[];
  rows: ContractRow[];
  asOfDate: string;
  canEdit: boolean;
  onSaved: () => Promise<void>;
}): BodySurfaceSectionSpec[] {
  const tenantConfig = useTenantConfig();
  const feedback = useFeedback();
  const normalized = useMemo(() => rows.filter((row) => row.source === "normalized"), [rows]);
  const normalizedKey = normalized.map((row) => `${row.agreementUid}:${row.version}`).join("|");
  const [draft, setDraft] = useState<AgreementDraft>(() => initialDraft(employments, normalized, asOfDate));
  const [editMode, setEditMode] = useState<AgreementEditMode>(() => normalized.length === 0 ? "create" : null);
  const [selectedCompany, setSelectedCompany] = useState(() => normalized[0]?.company || "主体未设置");
  const [selectedAgreementUid, setSelectedAgreementUid] = useState<string | null>(null);
  const draftAsOfDateRef = useRef(asOfDate);
  const normalizedKeyRef = useRef(normalizedKey);
  const [saving, setSaving] = useState(false);
  const selected = normalized.find((row) => row.agreementUid === selectedAgreementUid) ?? null;
  const attachment = useEmployeeAgreementAttachmentItems({
    employeeId,
    agreement: selected,
    canEdit,
    onSaved,
  });

  useEffect(() => {
    const asOfDateChanged = draftAsOfDateRef.current !== asOfDate;
    const agreementsChanged = normalizedKeyRef.current !== normalizedKey;
    draftAsOfDateRef.current = asOfDate;
    normalizedKeyRef.current = normalizedKey;
    if (!asOfDateChanged && !agreementsChanged) return;
    if (normalized.length === 0) {
      setSelectedCompany("主体未设置");
      setSelectedAgreementUid(null);
      setDraft(emptyAgreementDraft(employments, asOfDate));
      setEditMode("create");
      return;
    }
    const companies = new Set(normalized.map((row) => row.company || "主体未设置"));
    setSelectedCompany((current) => companies.has(current) ? current : normalized[0]?.company || "主体未设置");
    setSelectedAgreementUid((current) => current && normalized.some((row) => row.agreementUid === current) ? current : null);
    setDraft((current) => {
      const currentAgreement = normalized.find((row) => row.agreementUid === selectedAgreementUid) ?? null;
      return currentAgreement
        ? applyAgreement(current, currentAgreement)
        : initialDraft(employments, normalized, asOfDate);
    });
    if (editMode !== "create") setEditMode(null);
  }, [asOfDate, editMode, employments, normalized, normalizedKey, selectedAgreementUid]);

  const fields = useMemo(
    () => withTenantProfileFieldOptions(contractFields, tenantConfig),
    [tenantConfig],
  );

  function setField(key: string, value: unknown) {
    setDraft((current) => {
      if (key === "kind") {
        const kind = String(value) as AgreementCommandKind;
        const currentTerm = selected?.terms.filter((term) => term.recordState === "confirmed" && term.temporalState === "current").at(-1)
          ?? selected?.terms.filter((term) => term.recordState === "confirmed").at(-1);
        return {
          ...current,
          kind,
          termKind: termKindForCommand(kind, current.termKind),
          ...(kind === "end" && currentTerm ? {
            termUid: currentTerm.termUid,
            effectiveFrom: currentTerm.effectiveFrom ?? "",
            effectiveThrough: selected?.endDate ?? asOfDate,
          } : {}),
        };
      }
      return { ...current, [key]: value } as AgreementDraft;
    });
  }

  function selectAgreement(agreementUid: string) {
    if (selectedAgreementUid === agreementUid) {
      setSelectedAgreementUid(null);
      setEditMode(null);
      return;
    }
    const agreement = normalized.find((row) => row.agreementUid === agreementUid) ?? null;
    setSelectedAgreementUid(agreementUid);
    setDraft((current) => agreement ? applyAgreement(current, agreement) : { ...current, agreementUid });
    setEditMode(null);
  }

  function selectCompany(company: string) {
    setSelectedCompany(company);
    setSelectedAgreementUid(null);
    setEditMode(null);
  }

  function startEdit(mode: Exclude<AgreementEditMode, null>, company?: string | null) {
    if (mode === "create") {
      setSelectedAgreementUid(null);
      setDraft({
        ...emptyAgreementDraft(employments, asOfDate),
        company: company === undefined
          ? selectedCompany === "主体未设置" ? null : selectedCompany
          : company,
      });
    } else if (selected) {
      setDraft((current) => ({ ...applyAgreement(current, selected), reason: null }));
    }
    setEditMode(mode);
  }

  function cancelEdit() {
    setDraft((current) => selected ? { ...applyAgreement(current, selected), reason: null } : current);
    setEditMode(null);
  }

  function selectTerm(termUid: string) {
    const term = selected?.terms.find((item) => item.termUid === termUid) ?? null;
    setDraft((current) => term ? {
      ...current,
      termUid,
      effectiveFrom: term.effectiveFrom ?? "",
      effectiveThrough: term.effectiveThrough,
      termKind: term.termKind === "legacy" ? "initial" : term.termKind,
    } : { ...current, termUid });
  }

  async function submit(kind: EmploymentAgreementCommandKind) {
    const target = selected && selected.agreementUid
      ? { agreementUid: selected.agreementUid, expectedVersion: selected.version }
      : null;
    const content = {
      company: draft.company,
      legalRelation: draft.legalRelation,
      contractType: draft.contractType,
      employmentForm: draft.employmentForm,
    };
    let command: Record<string, unknown>;
    if (kind === "create") {
      const employment = employmentForAgreementDate(employments, draft.effectiveFrom);
      if (!employment.ok) {
        feedback.error(employment.message);
        return;
      }
      command = {
        kind,
        employmentId: employment.id,
        effectiveFrom: draft.effectiveFrom,
        effectiveThrough: draft.effectiveThrough,
        termKind: draft.termKind === "permanent" ? "permanent" : "initial",
        content,
      };
    } else if (!target) {
      feedback.error("请选择已规范化的协议");
      return;
    } else if (kind === "renew") {
      command = { kind, ...target, effectiveFrom: draft.effectiveFrom, effectiveThrough: draft.effectiveThrough, termKind: draft.termKind === "permanent" ? "permanent" : "renewal" };
    } else if (kind === "end") {
      command = { kind, ...target, termUid: draft.termUid, effectiveThrough: draft.effectiveThrough };
    } else if (kind === "correct") {
      command = { kind, ...target, termUid: draft.termUid, effectiveFrom: draft.effectiveFrom, effectiveThrough: draft.effectiveThrough, termKind: draft.termKind };
    } else if (kind === "supplement-missing" || kind === "correct-existing") {
      const patch = agreementContentPatch(selected, draft, kind);
      if (Object.keys(patch).length === 0) {
        feedback.error(kind === "supplement-missing" ? "请填写至少一项缺失资料" : "没有需要保存的修正");
        return;
      }
      if (
        kind === "correct-existing"
        && Object.hasOwn(patch, "company")
      ) {
        const confirmed = await feedback.confirm({
          title: "确认修正用工主体",
          message: "这里只能纠正历史录入错误；如果员工实际更换签约公司，应新增协议或办理用工关系变更。是否继续修正？",
          confirmLabel: "确认修正",
        });
        if (!confirmed) return;
      }
      command = { kind, ...target, patch };
    } else if (kind === "cancel-future") {
      command = { kind, ...target, termUid: draft.termUid };
    } else {
      command = { kind, ...target };
    }
    command.reason = draft.reason;
    command.sourceKind = "workspace-ui";
    setSaving(true);
    try {
      await requestJson(`/api/modules/hr/roster/employee-profiles/${employeeId}/agreements`, {
        method: "POST",
        body: JSON.stringify(command),
        headers: { "Idempotency-Key": crypto.randomUUID() },
        fallbackMessage: "协议变更失败",
      });
      feedback.success(
        kind === "supplement-missing"
          ? "缺失资料已补充"
          : kind === "correct-existing"
            ? "已登记资料已修正"
            : kind === "create"
              ? "协议已新增"
              : "协议期限变更已保存",
      );
      setEditMode(null);
      await onSaved();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "协议变更失败");
    } finally {
      setSaving(false);
    }
  }

  const missingRequiredLabels = uniqueContractMissingLabels(selected?.missingFields.filter((field) => field.required) ?? []);
  const missingOptionalLabels = uniqueContractMissingLabels(selected?.missingFields.filter((field) => !field.required) ?? []);
  const missingContentFields = agreementContentFieldsByMissingState(selected, true);
  const existingContentFields = agreementContentFieldsByMissingState(selected, false);
  const baselinePolicy = HR_EMPLOYMENT_AGREEMENT_TEMPORAL.baseline;
  const inlineSupplement = Boolean(
    canEdit
    &&
    baselinePolicy?.missingFieldPresentation === "inline-editable"
    && baselinePolicy.knownFieldPresentation === "read-only"
    && missingContentFields.length > 0,
  );
  const detailMode = editMode === "correct"
    ? "correct-existing" as const
    : inlineSupplement
      ? "supplement-missing" as const
      : "view" as const;
  const supplementPatch = selected && inlineSupplement
    ? agreementContentPatch(selected, draft, "supplement-missing")
    : {};
  const agreementCreate = canEdit ? {
    id: "agreement-create",
    title: "新建协议",
    trigger: "surface",
    presentation: "block",
    open: editMode === "create",
    canCreate: true,
    disabled: saving,
    content: {
      kind: "form",
      form: {
        items: createAgreementItems({ draft, fields, setField }),
        layout: { columns: 2 },
      },
    },
    submission: {
      action: "save",
      disabled: saving,
      execute: () => submit("create"),
    },
    onOpenChange: (open: boolean) => {
      if (open) startEdit("create");
      else cancelEdit();
    },
    onCancel: cancelEdit,
  } satisfies BodySurfaceSectionCreateSpec : undefined;
  const agreementActions = selected && canEdit
    ? editMode === "correct" ? [
        { key: "cancel-correction", action: "cancel" as const, label: "取消", disabled: saving, onClick: cancelEdit },
        {
          key: "save-correction",
          action: "save" as const,
          label: saving ? "保存中..." : "保存修正",
          disabled: saving || !draft.reason || Object.keys(agreementContentPatch(selected, draft, "correct-existing")).length === 0,
          onClick: () => void submit("correct-existing"),
        },
      ] : [
        ...(existingContentFields.length > 0 && baselinePolicy?.existingFactCorrectionPresentation === "explicit-mode" ? [{
          key: "correct-agreement-details",
          action: "edit" as const,
          label: "修正已登记资料",
          disabled: saving,
          onClick: () => startEdit("correct"),
        }] : []),
        ...(inlineSupplement ? [{
          key: "save-supplement",
          action: "save" as const,
          label: saving ? "保存中..." : "保存补充资料",
          disabled: saving || !draft.reason || Object.keys(supplementPatch).length === 0,
          onClick: () => void submit("supplement-missing"),
        }] : []),
      ]
    : [];
  const qualityItems: FormSurfaceItemSpec[] = [
    ...(missingOptionalLabels.length > 0 ? [{
      kind: "note" as const,
      key: "agreements-data-quality",
      content: `协议资料待补充：${missingOptionalLabels.join("、")}。不影响正常续签或终止。`,
    }] : []),
    ...(missingRequiredLabels.length > 0 ? [{
      kind: "note" as const,
      key: "agreements-baseline-incomplete",
      content: `协议缺少必填资料：${missingRequiredLabels.join("、")}。仅依赖这些字段的期限操作暂不可执行。`,
    }] : []),
  ];
  const termActions = selected && canEdit && detailMode === "view" ? [{
    key: "save-agreement-term",
    action: "save" as const,
    label: saving ? "保存中..." : "保存期限变更",
    disabled: saving,
    onClick: () => void submit(draft.kind),
  }] : [];
  const recordActions = [...agreementActions, ...termActions, ...attachment.actions];
  const detail = selected ? {
    items: [
      ...qualityItems,
      ...agreementDetailItems({ draft, selected, fields, mode: detailMode, setField }),
      ...(canEdit && detailMode === "view" ? [{
        kind: "section" as const,
        key: "agreement-term-command",
        title: "协议期限",
        layout: { columns: 2 as const },
        items: termCommandItems({ draft, selected, setField, selectTerm }),
      }] : []),
      ...attachment.items,
      { kind: "groupTitle" as const, key: "agreement-history-title", title: "期限与版本记录" },
    ],
    actions: recordActions,
    ...(detailMode === "supplement-missing" ? {
      mutation: {
        kind: "supplement-missing" as const,
        targetFields: missingContentFields.map((field) => `content.${field}`),
        missingFields: selected.missingFields.map((field) => field.path),
        actions: recordActions,
      },
    } : detailMode === "correct-existing" ? {
      mutation: {
        kind: "correct-existing" as const,
        targetFields: existingContentFields.map((field) => `content.${field}`),
        missingFields: selected.missingFields.map((field) => field.path),
        actions: recordActions,
      },
    } : {}),
    supplemental: agreementHistorySupplemental(selected),
  } : undefined;
  return agreementMasterSections({
    agreements: normalized,
    selectedCompany,
    selected,
    selectCompany,
    selectAgreement,
    create: agreementCreate,
    detail,
  });
}
