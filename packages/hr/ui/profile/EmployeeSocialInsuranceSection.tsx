"use client";

import { useEffect, useMemo, useState } from "react";

import { workspacePath } from "@workspace/core/routing";
import { createFieldsSection, createPanelSection, type BodySurfaceSectionCreateSpec, type BodySurfaceSectionSpec, type ReferenceOption, useFeedback } from "@workspace/core/ui";
import { HR_SOCIAL_INSURANCE_TEMPORAL } from "@workspace/hr/business-temporal";
import {
  employeeSocialInsuranceCurrentStatus,
  employeeSocialInsuranceRegistrationCompany,
  type EmployeeSocialInsuranceStatus,
} from "@workspace/hr/employee-social-insurance-contract";
import type { EmployeeSocialInsuranceRow } from "@workspace/hr/types";
import { createBusinessTemporalRecordSections } from "@workspace/platform/ui";
import {
  initialSocialInsuranceCommandDraft,
  socialInsuranceCommandItems,
  socialInsuranceCommandMissingRequiredField,
  socialInsuranceCorrectionStatusDefaults,
  socialInsuranceStatusCompanyDefaults,
  socialInsuranceStatusMonthDefaults,
  type InsuranceDraft,
} from "./EmployeeSocialInsuranceCommandPresentation";
import {
  initialSocialInsuranceSupplementDraft,
  socialInsuranceCorrectionItems,
  socialInsuranceCorrectionPatch,
  socialInsuranceCurrentStatusPanel,
  socialInsuranceRecordColumns,
  socialInsuranceSupplementableFields,
  socialInsuranceSupplementItems,
  socialInsuranceSupplementPatch,
  type SupplementDraft,
} from "./EmployeeSocialInsuranceRecordPresentation";

export function useEmployeeSocialInsuranceSections(input: {
  employeeId: number;
  rows: EmployeeSocialInsuranceRow[];
  asOfDate: string;
  canEdit: boolean;
  onSaved: () => Promise<void>;
}): BodySurfaceSectionSpec[] {
  const feedback = useFeedback();
  const current = useMemo(() => input.rows.find((row) => row.insuranceStatus === "insured") ?? null, [input.rows]);
  const currentStatus = useMemo(() => employeeSocialInsuranceCurrentStatus(input.rows), [input.rows]);
  const suggestedCompany = useMemo(
    () => employeeSocialInsuranceRegistrationCompany(currentStatus
      ? [currentStatus, ...input.rows.filter((row) => row.periodUid !== currentStatus.periodUid)]
      : input.rows),
    [currentStatus, input.rows],
  );
  const recordRows = useMemo(() => currentStatus
    ? [currentStatus, ...input.rows.filter((row) => row.periodUid !== currentStatus.periodUid)]
    : input.rows, [currentStatus, input.rows]);
  const [draft, setDraft] = useState<InsuranceDraft>(() => initialSocialInsuranceCommandDraft(current, suggestedCompany, input.asOfDate));
  const [registering, setRegistering] = useState(() => input.rows.length === 0);
  const [selectedPeriodUid, setSelectedPeriodUid] = useState<string | null>(null);
  const selected = useMemo(
    () => recordRows.find((row) => row.periodUid === selectedPeriodUid) ?? null,
    [recordRows, selectedPeriodUid],
  );
  const [supplementDraft, setSupplementDraft] = useState<SupplementDraft>(() => initialSocialInsuranceSupplementDraft(selected));
  const [saving, setSaving] = useState(false);
  const [savingSupplement, setSavingSupplement] = useState(false);
  const [correcting, setCorrecting] = useState(false);

  useEffect(() => {
    setDraft(initialSocialInsuranceCommandDraft(current, suggestedCompany, input.asOfDate));
    setRegistering(input.rows.length === 0);
  }, [current, input.asOfDate, input.rows.length, suggestedCompany]);

  useEffect(() => {
    setSelectedPeriodUid((existing) => (
      existing && input.rows.some((row) => row.periodUid === existing)
        ? existing
        : null
    ));
  }, [input.rows]);

  useEffect(() => {
    setSupplementDraft(initialSocialInsuranceSupplementDraft(selected));
    setCorrecting(false);
  }, [selected]);

  function setField(key: keyof InsuranceDraft, value: unknown, option?: ReferenceOption) {
    setDraft((existing) => ({
      ...existing,
      [key]: key === "companyId" ? Number(value) || null : String(value ?? ""),
      ...(key === "companyId" ? { companyName: option?.name ?? null } : {}),
      ...(key === "insuranceStatus" ? socialInsuranceStatusMonthDefaults(
        String(value) as EmployeeSocialInsuranceStatus,
        input.asOfDate,
      ) : {}),
      ...(key === "insuranceStatus" ? socialInsuranceStatusCompanyDefaults(
        String(value) as EmployeeSocialInsuranceStatus,
        existing,
        suggestedCompany,
      ) : {}),
    }));
  }

  async function submit() {
    const command = draft.kind === "register"
      ? {
          kind: draft.kind,
          insuranceStatus: draft.insuranceStatus,
          companyId: draft.insuranceStatus === "insured" || draft.insuranceStatus === "stopped"
            ? draft.companyId
            : null,
          startMonth: draft.insuranceStatus === "uninsured" ? null : draft.startMonth || null,
          endMonth: draft.insuranceStatus === "stopped" || draft.insuranceStatus === "retired"
            ? draft.endMonth || null
            : null,
          stopReason: draft.insuranceStatus === "stopped" ? draft.stopReason || null : null,
          note: draft.note || null,
        }
      : draft.kind === "transfer" && current
        ? { kind: draft.kind, periodUid: current.periodUid, expectedVersion: current.version, companyId: draft.companyId, startMonth: draft.startMonth, note: draft.note || null }
        : current
          ? { kind: "stop", periodUid: current.periodUid, expectedVersion: current.version, endMonth: draft.endMonth, stopReason: draft.stopReason, note: draft.note || null }
          : null;
    if (!command) return;
    if (draft.kind === "stop") {
      const confirmed = await feedback.confirm({
        title: "确认停止参保",
        message: `${draft.endMonth || "所选月份"} 将作为最后参保月份，是否继续？`,
        confirmLabel: "确认停保",
      });
      if (!confirmed) return;
    }
    setSaving(true);
    try {
      const response = await fetch(workspacePath(`/api/modules/hr/roster/employee-profiles/${input.employeeId}/social-insurance`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "社会保险办理失败");
      feedback.success(draft.kind === "register" ? "参保登记已保存" : draft.kind === "transfer" ? "参保转移已保存" : "停保记录已保存");
      setRegistering(false);
      await input.onSaved();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "社会保险办理失败");
    } finally {
      setSaving(false);
    }
  }

  function setSupplementField(key: keyof SupplementDraft, value: unknown, option?: ReferenceOption) {
    setSupplementDraft((existing) => ({
      ...existing,
      [key]: key === "companyId" ? Number(value) || null : String(value ?? ""),
      ...(key === "companyId" ? { companyName: option?.name ?? null } : {}),
      ...(key === "insuranceStatus" ? socialInsuranceCorrectionStatusDefaults(
        String(value) as EmployeeSocialInsuranceStatus,
      ) : {}),
    }));
  }

  async function submitSupplement() {
    if (!selected) return;
    const patch = socialInsuranceSupplementPatch(selected, supplementDraft);
    if (Object.keys(patch).length === 0 || !supplementDraft.reason.trim()) return;
    setSavingSupplement(true);
    try {
      const response = await fetch(workspacePath(`/api/modules/hr/roster/employee-profiles/${input.employeeId}/social-insurance`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "supplement-missing",
          periodUid: selected.periodUid,
          expectedVersion: selected.version,
          patch,
          reason: supplementDraft.reason,
        }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "补充资料保存失败");
      feedback.success("缺失资料已补充");
      await input.onSaved();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "补充资料保存失败");
    } finally {
      setSavingSupplement(false);
    }
  }

  async function submitCorrection() {
    if (!selected) return;
    const patch = socialInsuranceCorrectionPatch(selected, supplementDraft);
    if (Object.keys(patch).length === 0 || !supplementDraft.reason.trim()) return;
    setSavingSupplement(true);
    try {
      const response = await fetch(workspacePath(`/api/modules/hr/roster/employee-profiles/${input.employeeId}/social-insurance`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "correct-existing",
          periodUid: selected.periodUid,
          expectedVersion: selected.version,
          patch,
          reason: supplementDraft.reason,
        }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "社保资料修正失败");
      feedback.success("社保资料已修正");
      setCorrecting(false);
      await input.onSaved();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "社保资料修正失败");
    } finally {
      setSavingSupplement(false);
    }
  }

  const registrationCreate = input.canEdit && !current ? {
    id: "social-insurance-register",
    title: "参保登记",
    trigger: "surface",
    presentation: "block",
    open: registering,
    canCreate: true,
    disabled: saving,
    content: {
      kind: "form",
      form: {
        items: socialInsuranceCommandItems({ draft, current: null, saving, setField }),
        layout: { columns: 2 },
      },
    },
    submission: {
      action: "save",
      disabled: saving || socialInsuranceCommandMissingRequiredField(draft),
      execute: submit,
    },
    onOpenChange: (open: boolean) => {
      if (open) setDraft(initialSocialInsuranceCommandDraft(null, suggestedCompany, input.asOfDate));
      setRegistering(open);
    },
    onCancel: () => setRegistering(false),
  } satisfies BodySurfaceSectionCreateSpec : undefined;
  const sections: BodySurfaceSectionSpec[] = [];
  if (input.canEdit && current) {
    sections.push(createFieldsSection("social-insurance-command", socialInsuranceCommandItems({
      draft,
      current,
      saving,
      setField,
    }), {
      header: { title: "社会保险办理" },
      layout: { columns: 2 },
      actions: [
        {
          key: "save-social-insurance",
          action: "save" as const,
          label: saving ? "保存中..." : draft.kind === "register" ? "确认参保" : draft.kind === "transfer" ? "确认转移" : "确认停保",
          disabled: saving || socialInsuranceCommandMissingRequiredField(draft),
          onClick: () => void submit(),
        },
      ],
    }));
  }
  if (currentStatus) {
    sections.push(socialInsuranceCurrentStatusPanel(
      "social-insurance-current",
      currentStatus.insuranceStatus === "insured" ? "当前参保" : "当前社保状态",
      currentStatus,
      registrationCreate,
    ));
  } else if (registrationCreate) {
    sections.push(createPanelSection("social-insurance-current", {
      title: "当前社保状态",
      create: registrationCreate,
      sections: [],
    }));
  }
  if (input.rows.length > 0) {
    const hasSupplementFields = selected ? socialInsuranceSupplementableFields(selected).length > 0 : false;
    const supplementActions = selected && input.canEdit && hasSupplementFields && !correcting ? [{
      key: "save-social-insurance-supplement",
      action: "save" as const,
      label: savingSupplement ? "保存中..." : "保存补充资料",
      disabled: savingSupplement
        || !supplementDraft.reason.trim()
        || Object.keys(socialInsuranceSupplementPatch(selected, supplementDraft)).length === 0,
      onClick: () => void submitSupplement(),
    }] : [];
    const correctionPatch = selected ? socialInsuranceCorrectionPatch(selected, supplementDraft) : {};
    const correctionTargetFields = selected
      ? ["insuranceStatus", "companyId", "startMonth", "endMonth", "stopReason", "note"]
          .filter((field) => !selected.missingFields.includes(field))
      : [];
    const correctionActions = selected && input.canEdit ? correcting ? [{
      key: "cancel-social-insurance-correction",
      action: "cancel" as const,
      label: "取消",
      disabled: savingSupplement,
      onClick: () => {
        setSupplementDraft(initialSocialInsuranceSupplementDraft(selected));
        setCorrecting(false);
      },
    }, {
      key: "save-social-insurance-correction",
      action: "save" as const,
      label: savingSupplement ? "保存中..." : "保存修正",
      disabled: savingSupplement || !supplementDraft.reason.trim() || Object.keys(correctionPatch).length === 0,
      onClick: () => void submitCorrection(),
    }] : [{
      key: "start-social-insurance-correction",
      action: "edit" as const,
      label: "修正已登记资料",
      disabled: savingSupplement,
      onClick: () => setCorrecting(true),
    }] : [];
    sections.push(...createBusinessTemporalRecordSections({
      registration: HR_SOCIAL_INSURANCE_TEMPORAL,
      key: "social-insurance",
      title: `社保记录（${recordRows.length}）`,
      rows: recordRows,
      columns: socialInsuranceRecordColumns(currentStatus?.periodUid ?? null),
      visibleColumns: ["company", "status", "startMonth", "endMonth", "stopReason"],
      rowKey: (row) => row.periodUid,
      selectedKey: selectedPeriodUid,
      onSelect: (row) => setSelectedPeriodUid((existing) => existing === row.periodUid ? null : row.periodUid),
      emptyText: "暂无社保记录",
      detail: selected ? {
        items: correcting
          ? socialInsuranceCorrectionItems({ row: selected, draft: supplementDraft, saving: savingSupplement, setField: setSupplementField })
          : socialInsuranceSupplementItems({
              row: selected,
              draft: supplementDraft,
              editable: input.canEdit && hasSupplementFields,
              saving: savingSupplement,
              setField: setSupplementField,
            }),
        mutation: correcting ? {
          kind: "correct-existing",
          targetFields: correctionTargetFields,
          missingFields: selected.missingFields,
          actions: correctionActions,
        } : supplementActions.length > 0 ? {
          kind: "supplement-missing",
          targetFields: socialInsuranceSupplementableFields(selected),
          missingFields: selected.missingFields,
          actions: [...correctionActions, ...supplementActions],
        } : correctionActions.length > 0 ? {
          kind: "correct-existing",
          targetFields: correctionTargetFields,
          missingFields: selected.missingFields,
          actions: correctionActions,
        } : undefined,
      } : undefined,
    }));
  }
  return sections;
}
