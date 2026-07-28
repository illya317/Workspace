"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { type BodySurfaceSectionSpec, type FormSurfaceItemSpec, useFeedback } from "@workspace/core/ui";
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
  createAgreementCreateSpec,
  agreementDetailItems,
  agreementHistorySupplemental,
  agreementMasterSections,
  agreementRenewalItems,
  applyAgreement,
  applyAgreementTerm,
  emptyAgreementDraft,
  initialDraft,
  termKindForCommand,
  type AgreementDraft,
} from "./EmployeeProfileContractForm";
import { nextAgreementPeriodNo, type AgreementHistoryRow } from "./EmployeeProfileContractModel";
import {
  agreementTermCommandReady,
  agreementTermSupplementPatch,
  type AgreementTermOperation,
  useAgreementHistoryExpandedRow,
} from "./EmployeeProfileContractRecordEditor";
type AgreementEditMode = "create" | "replace" | "renew" | "supplement" | "correct" | null;

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
  const [selectedHistoryKey, setSelectedHistoryKey] = useState<string | null>(null);
  const [termOperation, setTermOperation] = useState<AgreementTermOperation>("edit");
  const draftAsOfDateRef = useRef(asOfDate);
  const normalizedKeyRef = useRef(normalizedKey);
  const [saving, setSaving] = useState(false);
  const selected = normalized.find((row) => row.agreementUid === selectedAgreementUid) ?? null;
  const selectedHistoryTerm = selected?.terms.find((term) => `term-${term.termUid}` === selectedHistoryKey) ?? null;
  const selectedHistoryRevision = selected?.revisions.find((revision) => `revision-${revision.revisionUid}` === selectedHistoryKey) ?? null;
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
    setEditMode(null);
  }, [asOfDate, editMode, employments, normalized, normalizedKey, selectedAgreementUid]);

  useEffect(() => {
    if (!selectedHistoryKey) return;
    const exists = Boolean(
      selected?.terms.some((term) => `term-${term.termUid}` === selectedHistoryKey)
      || selected?.revisions.some((revision) => `revision-${revision.revisionUid}` === selectedHistoryKey),
    );
    if (!exists) setSelectedHistoryKey(null);
  }, [selected, selectedHistoryKey]);

  const fields = useMemo(
    () => withTenantProfileFieldOptions(contractFields, tenantConfig),
    [tenantConfig],
  );
  function setField(key: string, value: unknown) {
    setDraft((current) => {
      if (key === "durationKind") {
        const durationKind = value === "indefinite" ? "indefinite" : "fixed";
        return {
          ...current,
          durationKind,
          ...(durationKind === "indefinite" ? { effectiveThrough: null } : {}),
        };
      }
      return { ...current, [key]: value } as AgreementDraft;
    });
  }

  function selectAgreement(agreementUid: string) {
    if (selectedAgreementUid === agreementUid) {
      setSelectedAgreementUid(null);
      setSelectedHistoryKey(null);
      setEditMode(null);
      return;
    }
    const agreement = normalized.find((row) => row.agreementUid === agreementUid) ?? null;
    setSelectedAgreementUid(agreementUid);
    setDraft((current) => agreement ? applyAgreement(current, agreement) : { ...current, agreementUid });
    setSelectedHistoryKey(null);
    setEditMode(null);
  }

  function selectCompany(company: string) {
    setSelectedCompany(company);
    setSelectedAgreementUid(null);
    setSelectedHistoryKey(null);
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
    } else if (mode === "replace" && selected) {
      setDraft({
        ...emptyAgreementDraft(employments, asOfDate),
        kind: "replace",
        agreementUid: selected.agreementUid ?? "",
        company: selected.company,
        legalRelation: selected.legalRelation,
        contractType: selected.contractType,
        employmentForm: selected.employmentForm,
        reason: null,
      });
    } else if (mode === "renew" && selected) {
      setDraft((current) => ({
        ...applyAgreement({ ...current, kind: "renew" }, selected),
        kind: "renew",
        termUid: "",
        effectiveFrom: asOfDate,
        effectiveThrough: null,
        durationKind: "fixed",
        reason: null,
      }));
    } else if (selected) {
      setDraft((current) => ({ ...applyAgreement(current, selected), reason: null }));
    }
    setSelectedHistoryKey(null);
    setEditMode(mode);
  }

  function cancelEdit() {
    setDraft((current) => selected ? { ...applyAgreement(current, selected), reason: null } : current);
    setEditMode(null);
  }
  function selectHistoryRecord(history: AgreementHistoryRow) {
    if (selectedHistoryKey === history.key) {
      setSelectedHistoryKey(null);
      return;
    }
    setEditMode(null);
    setSelectedHistoryKey(history.key);
    setTermOperation("edit");
    if (history.recordType !== "term") return;
    const term = selected?.terms.find((item) => item.termUid === history.recordUid) ?? null;
    if (!term) return;
    setDraft((current) => applyAgreementTerm({ ...current, kind: "correct", reason: null }, term));
  }
  function startTermOperation(operation: AgreementTermOperation) {
    if (!selectedHistoryTerm) return;
    setTermOperation(operation);
    setDraft((current) => {
      const next = applyAgreementTerm({ ...current, reason: null }, selectedHistoryTerm);
      if (operation === "end") {
        return { ...next, kind: "end", effectiveThrough: selected?.endDate ?? asOfDate };
      }
      if (operation === "cancel") return { ...next, kind: "cancel-future" };
      return { ...next, kind: "correct" };
    });
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
    if (kind === "create" || kind === "replace") {
      if (kind === "replace" && !target) {
        feedback.error("请选择需要更换的协议");
        return;
      }
      const employment = employmentForAgreementDate(employments, draft.effectiveFrom);
      if (!employment.ok) {
        feedback.error(employment.message);
        return;
      }
      command = {
        kind,
        ...(kind === "replace" ? target : {}),
        employmentId: employment.id,
        effectiveFrom: draft.effectiveFrom,
        effectiveThrough: draft.effectiveThrough,
        termKind: termKindForCommand(kind, draft.durationKind),
        content,
      };
    } else if (!selected || !target) {
      feedback.error("请选择已规范化的协议");
      return;
    } else if (kind === "renew") {
      command = {
        kind,
        ...target,
        effectiveFrom: draft.effectiveFrom,
        effectiveThrough: draft.effectiveThrough,
        termKind: termKindForCommand(kind, draft.durationKind),
      };
    } else if (kind === "supplement-term") {
      const patch = agreementTermSupplementPatch(selected, draft);
      if (Object.keys(patch).length === 0) {
        feedback.error("请填写至少一项缺失的期限资料");
        return;
      }
      command = { kind, ...target, termUid: draft.termUid, patch };
    } else if (kind === "end") {
      command = { kind, ...target, termUid: draft.termUid, effectiveThrough: draft.effectiveThrough };
    } else if (kind === "correct") {
      const targetTerm = selected.terms.find((term) => term.termUid === draft.termUid) ?? null;
      if (!targetTerm) {
        feedback.error("请选择需要修正的期限记录");
        return;
      }
      command = {
        kind,
        ...target,
        termUid: draft.termUid,
        effectiveFrom: draft.effectiveFrom,
        effectiveThrough: draft.effectiveThrough,
        termKind: termKindForCommand(kind, draft.durationKind, targetTerm),
      };
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
          message: "这里只能纠正历史录入错误；如果员工实际更换协议，应使用“更换协议”生成一份新协议。是否继续修正？",
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
          : kind === "supplement-term"
            ? "缺失期限已补充"
          : kind === "correct-existing"
            ? "已登记资料已修正"
            : kind === "replace"
              ? "协议已更换"
            : kind === "create"
              ? "协议已新增"
              : "协议期限变更已保存",
      );
      setEditMode(null);
      setSelectedHistoryKey(null);
      setTermOperation("edit");
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
  const canSupplementContent = Boolean(
    canEdit
    &&
    baselinePolicy?.missingFieldPresentation === "inline-editable"
    && baselinePolicy.knownFieldPresentation === "read-only"
    && missingContentFields.length > 0,
  );
  const detailMode = editMode === "correct"
    ? "correct-existing" as const
    : editMode === "supplement"
      ? "supplement-missing" as const
      : "view" as const;
  const supplementPatch = selected && editMode === "supplement"
    ? agreementContentPatch(selected, draft, "supplement-missing")
    : {};
  const createMode = editMode === "replace" ? "replace" as const : "create" as const;
  const agreementCreate = createAgreementCreateSpec({
    canEdit,
    mode: createMode,
    draft,
    fields,
    saving,
    opened: editMode === "create" || editMode === "replace",
    setField,
    submit: () => void submit(createMode),
    open: () => startEdit(createMode),
    cancel: cancelEdit,
  });
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
      ] : editMode === "supplement" ? [
        { key: "cancel-supplement", action: "cancel" as const, label: "取消", disabled: saving, onClick: cancelEdit },
        {
          key: "save-supplement",
          action: "save" as const,
          label: saving ? "保存中..." : "保存补充资料",
          disabled: saving || !draft.reason || Object.keys(supplementPatch).length === 0,
          onClick: () => void submit("supplement-missing"),
        },
      ] : editMode === "renew" ? [
        { key: "cancel-renewal", action: "cancel" as const, label: "取消", disabled: saving, onClick: cancelEdit },
        {
          key: "save-renewal",
          action: "save" as const,
          label: saving ? "保存中..." : "确认续签",
          disabled: saving || !agreementTermCommandReady(selected, draft),
          onClick: () => void submit("renew"),
        },
      ] : editMode === "replace" ? [] : [
        {
          key: "renew-agreement",
          action: "create" as const,
          label: "续签",
          disabled: saving,
          onClick: () => startEdit("renew"),
        },
        {
          key: "replace-agreement",
          action: "edit" as const,
          label: "更换协议",
          disabled: saving,
          onClick: () => startEdit("replace"),
        },
        ...(existingContentFields.length > 0 && baselinePolicy?.existingFactCorrectionPresentation === "explicit-mode" ? [{
          key: "correct-agreement-details",
          action: "edit" as const,
          label: "修正已登记资料",
          disabled: saving,
          onClick: () => startEdit("correct"),
        }] : []),
        ...(canSupplementContent ? [{
          key: "supplement-agreement-details",
          action: "edit" as const,
          label: "补充协议资料",
          disabled: saving,
          onClick: () => startEdit("supplement"),
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
  const recordActions = [...agreementActions, ...attachment.actions];
  const historyExpandedRow = useAgreementHistoryExpandedRow({
    agreement: selected,
    term: selectedHistoryTerm,
    revision: selectedHistoryRevision,
    draft,
    operation: termOperation,
    canEdit,
    saving,
    setField,
    startOperation: startTermOperation,
    submit: (kind) => void submit(kind),
  });
  const detail = selected ? {
    items: [
      ...qualityItems,
      ...agreementDetailItems({ draft, selected, fields, mode: detailMode, setField }),
      ...(canEdit && editMode === "renew" ? [{
        kind: "section" as const,
        key: "agreement-renewal",
        title: "续签",
        layout: { columns: 2 as const },
        items: agreementRenewalItems({ draft, periodNo: nextAgreementPeriodNo(selected), setField }),
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
    supplemental: agreementHistorySupplemental({
      row: selected,
      selectedKey: selectedHistoryKey,
      onSelect: selectHistoryRecord,
      expandedRow: historyExpandedRow,
    }),
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
