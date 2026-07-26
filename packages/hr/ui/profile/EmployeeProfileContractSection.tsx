"use client";

import { useEffect, useMemo, useState } from "react";

import {
  createFieldsSection,
  createMessageSection,
  createPanelSection,
  type BodySurfaceSectionSpec,
  type FormSurfaceItemSpec,
  useFeedback,
} from "@workspace/core/ui";
import { contractFields, withTenantProfileFieldOptions } from "@workspace/hr/constants";
import { HR_EMPLOYMENT_AGREEMENT_TEMPORAL } from "@workspace/hr/business-temporal";
import type {
  ContractRow,
  EmploymentAgreementRevisionRow,
  EmploymentAgreementTermRow,
  EmploymentRow,
  ProfileField,
} from "@workspace/hr/types";
import { createBusinessTemporalView } from "@workspace/platform/ui";
import { requestJson } from "@workspace/platform/ui/api-client";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";
import { profileFieldSpec } from "./EmployeeProfileFieldSpecs";
import type { EditableRecord } from "./EmployeeProfileUtils";

type AgreementCommandKind =
  | "create"
  | "renew"
  | "end"
  | "correct"
  | "revise"
  | "publish"
  | "supersede"
  | "set-primary"
  | "cancel-future";

interface AgreementDraft extends EditableRecord {
  kind: AgreementCommandKind;
  agreementUid: string;
  employmentId: number | null;
  termUid: string;
  revisionUid: string;
  effectiveFrom: string;
  effectiveThrough: string | null;
  termKind: "initial" | "renewal" | "permanent";
  company: string | null;
  insuranceStatus: string | null;
  legalRelation: string | null;
  contractType: string | null;
  employmentForm: string | null;
  confidentialityDate: string | null;
  nonCompeteDate: string | null;
  isPrimary: boolean;
  reason: string | null;
}

const COMMAND_OPTIONS: Array<{ value: AgreementCommandKind; label: string }> = [
  { value: "create", label: "新建协议" },
  { value: "renew", label: "续签" },
  { value: "end", label: "终止期限" },
  { value: "correct", label: "修正期限" },
  { value: "revise", label: "新建条款草稿" },
  { value: "publish", label: "发布草稿" },
  { value: "supersede", label: "替代当前条款" },
  { value: "set-primary", label: "设为主协议" },
  { value: "cancel-future", label: "取消未来期限" },
];

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
  const [saving, setSaving] = useState(false);
  const selected = normalized.find((row) => row.agreementUid === draft.agreementUid) ?? normalized[0] ?? null;

  useEffect(() => {
    if (normalized.length === 0) return;
    if (draft.agreementUid && normalized.some((row) => row.agreementUid === draft.agreementUid)) return;
    setDraft(initialDraft(employments, normalized, asOfDate));
  }, [asOfDate, draft.agreementUid, employments, normalized, normalizedKey]);

  const fields = useMemo(
    () => withTenantProfileFieldOptions(contractFields, tenantConfig),
    [tenantConfig],
  );

  function setField(key: string, value: unknown) {
    setDraft((current) => ({ ...current, [key]: value } as AgreementDraft));
  }

  function selectAgreement(agreementUid: string) {
    const agreement = normalized.find((row) => row.agreementUid === agreementUid) ?? null;
    setDraft((current) => agreement ? applyAgreement(current, agreement) : { ...current, agreementUid });
  }

  async function submit() {
    const target = selected && selected.agreementUid
      ? { agreementUid: selected.agreementUid, expectedVersion: selected.version }
      : null;
    const content = {
      company: draft.company,
      insuranceStatus: draft.insuranceStatus,
      legalRelation: draft.legalRelation,
      contractType: draft.contractType,
      employmentForm: draft.employmentForm,
      confidentialityDate: draft.confidentialityDate,
      nonCompeteDate: draft.nonCompeteDate,
    };
    let command: Record<string, unknown>;
    if (draft.kind === "create") {
      command = {
        kind: draft.kind,
        employmentId: draft.employmentId,
        isPrimary: draft.isPrimary,
        effectiveFrom: draft.effectiveFrom,
        effectiveThrough: draft.effectiveThrough,
        termKind: draft.termKind === "permanent" ? "permanent" : "initial",
        content,
      };
    } else if (!target) {
      feedback.error("请选择已规范化的协议");
      return;
    } else if (draft.kind === "renew") {
      command = { kind: draft.kind, ...target, effectiveFrom: draft.effectiveFrom, effectiveThrough: draft.effectiveThrough, termKind: draft.termKind === "permanent" ? "permanent" : "renewal" };
    } else if (draft.kind === "end") {
      command = { kind: draft.kind, ...target, termUid: draft.termUid, effectiveThrough: draft.effectiveThrough };
    } else if (draft.kind === "correct") {
      command = { kind: draft.kind, ...target, termUid: draft.termUid, effectiveFrom: draft.effectiveFrom, effectiveThrough: draft.effectiveThrough, termKind: draft.termKind };
    } else if (draft.kind === "revise" || draft.kind === "supersede") {
      command = { kind: draft.kind, ...target, content };
    } else if (draft.kind === "publish") {
      command = { kind: draft.kind, ...target, revisionUid: draft.revisionUid };
    } else if (draft.kind === "cancel-future") {
      command = { kind: draft.kind, ...target, termUid: draft.termUid };
    } else {
      command = { kind: draft.kind, ...target };
    }
    command.reason = draft.reason;
    command.sourceKind = "workspace-ui";
    setSaving(true);
    try {
      await requestJson(`/api/modules/hr/roster/employee-profiles/${employeeId}/agreements`, {
        method: "POST",
        body: JSON.stringify(command),
        headers: { "Idempotency-Key": crypto.randomUUID() },
        fallbackMessage: "协议生命周期变更失败",
      });
      feedback.success("协议生命周期变更已保存");
      await onSaved();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "协议生命周期变更失败");
    } finally {
      setSaving(false);
    }
  }

  const sections: BodySurfaceSectionSpec[] = rows.length === 0
    ? [createMessageSection("agreements-empty", { content: "暂无雇佣协议" })]
    : rows.map((row) => agreementPanel(row, fields, asOfDate));
  if (rows.some((row) => row.source === "legacy-json")) {
    sections.unshift(createMessageSection("agreements-legacy", {
      tone: "warning",
      content: "旧合同 JSON 仅供核对，不能修改或删除；请先完成迁移预检，再以稳定协议身份录入。",
    }));
  }
  if (canEdit) {
    sections.unshift(createFieldsSection("agreement-command", commandItems({
        draft,
        employments,
        agreements: normalized,
        selected,
        fields,
        setField,
        selectAgreement,
      }), {
      header: { title: "协议生命周期变更" },
      layout: { columns: 2 },
      actions: [{
        key: "save-agreement-command",
        action: "save",
        label: saving ? "保存中..." : "保存变更",
        disabled: saving,
        onClick: () => void submit(),
      }],
    }));
  }
  return sections;
}

function agreementPanel(row: ContractRow, fields: ProfileField[], asOfDate: string) {
  const currentRevision = row.revisions.find((revision) => revision.revisionUid === row.currentRevisionUid) ?? row.revisions[0];
  const currentTerms = row.terms.filter((term) => term.recordState === "confirmed" && term.temporalState === "current");
  const view = createBusinessTemporalView({
    kind: "revision",
    registration: HR_EMPLOYMENT_AGREEMENT_TEMPORAL,
    asOfDate,
    current: currentRevision ? revisionItem(row, currentRevision, currentTerms) : undefined,
    drafts: row.revisions.filter((revision) => revision.recordState === "draft").map((revision) => revisionItem(row, revision, [])),
    scheduled: row.terms.filter((term) => term.recordState === "confirmed" && term.temporalState === "upcoming").map(termItem),
    history: [
      ...row.revisions.filter((revision) => revision.revisionUid !== currentRevision?.revisionUid && revision.recordState !== "draft").map((revision) => revisionItem(row, revision, [])),
      ...row.terms.filter((term) => term.temporalState === "past" || term.recordState !== "confirmed").map(termItem),
    ],
  });
  return createPanelSection(`agreement-${row.id}`, {
    title: `${row.company || "未设置公司"}${row.isPrimary ? " · 主协议" : ""}${row.source === "legacy-json" ? " · 旧数据" : ` · v${row.version}`}`,
    sections: view.body.sections,
  });
}

function revisionItem(row: ContractRow, revision: EmploymentAgreementRevisionRow, terms: EmploymentAgreementTermRow[]) {
  return {
    key: revision.revisionUid,
    title: `条款版本 ${revision.revisionNo}`,
    description: [revision.content.contractType, revision.content.legalRelation, revision.content.employmentForm].filter(Boolean).join(" · ") || "未填写条款分类",
    meta: terms.length > 0 ? terms.map(periodLabel).join("；") : revision.createdAt || undefined,
    temporalState: row.temporalState,
    recordState: revision.recordState,
  } as const;
}

function termItem(term: EmploymentAgreementTermRow) {
  return {
    key: term.termUid,
    title: `${term.termKind === "initial" ? "首签" : term.termKind === "renewal" ? "续签" : term.termKind === "permanent" ? "无固定期限" : "旧期限"} · 第 ${term.sequence} 期`,
    description: term.reason || undefined,
    validFrom: term.effectiveFrom,
    validThrough: term.effectiveThrough,
    temporalState: term.temporalState,
    recordState: term.recordState,
  } as const;
}

function commandItems(input: {
  draft: AgreementDraft;
  employments: EmploymentRow[];
  agreements: ContractRow[];
  selected: ContractRow | null;
  fields: ProfileField[];
  setField: (key: string, value: unknown) => void;
  selectAgreement: (uid: string) => void;
}): FormSurfaceItemSpec[] {
  const { draft, employments, agreements, selected, fields, setField, selectAgreement } = input;
  const items: FormSurfaceItemSpec[] = [choiceItem("kind", "变更类型", draft.kind, COMMAND_OPTIONS, (value) => setField("kind", value))];
  if (draft.kind === "create") {
    items.push(choiceItem("employmentId", "雇佣记录", draft.employmentId == null ? "" : String(draft.employmentId), employments.map((row) => ({ value: String(row.id), label: `${row.joinDate || "未注明"} — ${row.leaveDate || "长期"}` })), (value) => setField("employmentId", Number(value))));
  } else {
    items.push(choiceItem("agreementUid", "协议", draft.agreementUid, agreements.map((row) => ({ value: row.agreementUid!, label: `${row.company || "未设置公司"} · v${row.version}` })), selectAgreement));
  }
  if (["end", "correct", "cancel-future"].includes(draft.kind)) {
    items.push(choiceItem("termUid", "期限", draft.termUid, (selected?.terms ?? []).filter((term) => term.recordState === "confirmed").map((term) => ({ value: term.termUid, label: periodLabel(term) })), (value) => setField("termUid", value)));
  }
  if (draft.kind === "publish") {
    items.push(choiceItem("revisionUid", "草稿", draft.revisionUid, (selected?.revisions ?? []).filter((revision) => revision.recordState === "draft").map((revision) => ({ value: revision.revisionUid, label: `版本 ${revision.revisionNo}` })), (value) => setField("revisionUid", value)));
  }
  if (["create", "renew", "correct"].includes(draft.kind)) {
    items.push(dateItem("effectiveFrom", "开始日期", draft.effectiveFrom, (value) => setField("effectiveFrom", value)));
  }
  if (["create", "renew", "end", "correct"].includes(draft.kind)) {
    items.push(dateItem("effectiveThrough", "结束日期", draft.effectiveThrough, (value) => setField("effectiveThrough", value)));
  }
  if (["create", "renew", "correct"].includes(draft.kind)) {
    items.push(choiceItem("termKind", "期限类型", draft.termKind, [
      ...(draft.kind === "create" ? [{ value: "initial", label: "首签" }] : [{ value: "renewal", label: "续签" }]),
      { value: "permanent", label: "无固定期限" },
    ], (value) => setField("termKind", value)));
  }
  if (["create", "revise", "supersede"].includes(draft.kind)) {
    for (const key of ["company", "insuranceStatus", "legalRelation", "contractType", "employmentForm", "confidentialityDate", "nonCompeteDate"]) {
      const field = fields.find((item) => item.key === key);
      if (field) items.push(profileFieldSpec(field, draft, false, setField));
    }
  }
  if (draft.kind === "create") {
    items.push(choiceItem("isPrimary", "主协议", draft.isPrimary ? "true" : "false", [{ value: "true", label: "是" }, { value: "false", label: "否" }], (value) => setField("isPrimary", value === "true")));
  }
  items.push({
    key: "reason",
    label: "变更说明",
    spec: { valueType: "string", control: "text", multiline: true, state: "normal" },
    value: draft.reason,
    onChange: (value) => setField("reason", value),
  });
  return items;
}

function choiceItem(
  key: string,
  label: string,
  value: string,
  options: Array<{ value: string; label: string }>,
  onChange: (value: string) => void,
): FormSurfaceItemSpec {
  return {
    key,
    label,
    spec: { valueType: "string", control: "choice", state: options.length > 0 ? "normal" : "disabled", options: { source: "static", items: options, visibleCount: 8 } },
    value,
    onChange: (next) => onChange(String(next ?? "")),
  };
}

function dateItem(key: string, label: string, value: string | null, onChange: (value: unknown) => void): FormSurfaceItemSpec {
  return {
    key,
    label,
    spec: { valueType: "date", control: "temporal", precision: "date", state: "normal" },
    value,
    onChange,
  };
}

function initialDraft(employments: EmploymentRow[], agreements: ContractRow[], asOfDate: string): AgreementDraft {
  const agreement = agreements.find((row) => row.isPrimary) ?? agreements[0] ?? null;
  const kind: AgreementCommandKind = agreements.length > 0 ? "renew" : "create";
  return applyAgreement({
    kind,
    agreementUid: "",
    employmentId: employments.find((row) => row.temporalState === "current")?.id ?? employments[0]?.id ?? null,
    termUid: "",
    revisionUid: "",
    effectiveFrom: asOfDate,
    effectiveThrough: null,
    termKind: agreements.length > 0 ? "renewal" : "initial",
    company: null,
    insuranceStatus: null,
    legalRelation: null,
    contractType: null,
    employmentForm: null,
    confidentialityDate: null,
    nonCompeteDate: null,
    isPrimary: agreements.length === 0,
    reason: null,
  }, agreement);
}

function applyAgreement(draft: AgreementDraft, agreement: ContractRow | null): AgreementDraft {
  if (!agreement) return draft;
  return {
    ...draft,
    agreementUid: agreement.agreementUid || "",
    employmentId: agreement.employmentId,
    termUid: agreement.terms.find((term) => term.recordState === "confirmed")?.termUid ?? "",
    revisionUid: agreement.revisions.find((revision) => revision.recordState === "draft")?.revisionUid ?? "",
    company: agreement.company || null,
    insuranceStatus: agreement.insuranceStatus,
    legalRelation: agreement.legalRelation || null,
    contractType: agreement.contractType || null,
    employmentForm: agreement.employmentForm || null,
    confidentialityDate: agreement.confidentialityDate,
    nonCompeteDate: agreement.nonCompeteDate,
    isPrimary: agreement.isPrimary,
  };
}

function periodLabel(term: EmploymentAgreementTermRow) {
  return `${term.effectiveFrom} — ${term.effectiveThrough || "长期"}`;
}
