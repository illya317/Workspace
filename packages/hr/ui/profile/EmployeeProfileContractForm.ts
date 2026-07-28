import { type BodySurfaceSectionCreateSpec, type BodySurfaceSectionSpec, type DataSurfaceCellSpec, type DataSurfaceColumnSpec, type FormSurfaceItemSpec } from "@workspace/core/ui";
import { HR_EMPLOYMENT_AGREEMENT_TEMPORAL } from "@workspace/hr/business-temporal";
import { employmentAgreementFieldRequired, employmentAgreementFieldLabel, type EmploymentAgreementCommandKind, type EmploymentAgreementFormField } from "@workspace/hr/employment-agreement-field-contract";
import {
  agreementTermDurationKind,
  agreementTermExpiryLabel,
  contractPeriodLabel,
  preferredAgreementTerm,
} from "@workspace/hr/agreement-term-semantics";
import type { ContractRow, ProfileField } from "@workspace/hr/types";
import { createBusinessTemporalRecordSections, type BusinessTemporalRecordDetailSpec } from "@workspace/platform/ui";
import { profileFieldSpec } from "./EmployeeProfileFieldSpecs";
import { agreementHistoryRows, type AgreementDraft, type AgreementHistoryRow } from "./EmployeeProfileContractModel";

export {
  agreementTermMissingFields,
  agreementTermsForCommand,
  applyAgreement,
  applyAgreementTerm,
  emptyAgreementDraft,
  initialDraft,
  termKindForCommand,
} from "./EmployeeProfileContractModel";
export type { AgreementCommandKind, AgreementDraft } from "./EmployeeProfileContractModel";

const AGREEMENT_CONTENT_FIELDS = ["company", "legalRelation", "contractType", "employmentForm"] as const satisfies readonly EmploymentAgreementFormField[];
type AgreementContentField = typeof AGREEMENT_CONTENT_FIELDS[number];

export function createAgreementItems(input: {
  draft: AgreementDraft;
  fields: ProfileField[];
  setField: (key: string, value: unknown) => void;
  commandKind?: "create" | "replace";
}): FormSurfaceItemSpec[] {
  const { draft, fields, setField, commandKind = "create" } = input;
  const items: FormSurfaceItemSpec[] = [
    dateItem("effectiveFrom", "开始日期", draft.effectiveFrom, (value) => setField("effectiveFrom", value), employmentAgreementFieldRequired(commandKind, "effectiveFrom")),
    durationKindItem(draft, setField, commandKind),
    ...(draft.durationKind === "fixed"
      ? [dateItem("effectiveThrough", employmentAgreementFieldLabel(commandKind, "effectiveThrough"), draft.effectiveThrough, (value) => setField("effectiveThrough", value), true)]
      : [readOnlyItem("effectiveThrough", "到期日期", "不适用")]),
  ];
  appendAgreementContentItems(items, fields, draft, setField, commandKind);
  if (employmentAgreementFieldRequired(commandKind, "reason")) {
    items.push(reasonItem(draft, setField, commandKind));
  }
  return items;
}

export function createAgreementCreateSpec(input: {
  canEdit: boolean;
  mode: "create" | "replace";
  draft: AgreementDraft;
  fields: ProfileField[];
  saving: boolean;
  opened: boolean;
  setField: (key: string, value: unknown) => void;
  submit: () => void;
  open: () => void;
  cancel: () => void;
}): BodySurfaceSectionCreateSpec | undefined {
  if (!input.canEdit) return undefined;
  return {
    id: "agreement-create",
    title: input.mode === "replace" ? "更换协议" : "新建协议",
    trigger: "surface",
    presentation: "block",
    open: input.opened,
    canCreate: true,
    disabled: input.saving,
    content: {
      kind: "form",
      form: {
        items: createAgreementItems({ draft: input.draft, fields: input.fields, setField: input.setField, commandKind: input.mode }),
        layout: { columns: 2 },
      },
    },
    submission: { action: "save", disabled: input.saving, execute: input.submit },
    onOpenChange: (open) => open ? input.open() : input.cancel(),
    onCancel: input.cancel,
  };
}

export function agreementDetailItems(input: {
  draft: AgreementDraft;
  selected: ContractRow;
  fields: ProfileField[];
  mode: "view" | "supplement-missing" | "correct-existing";
  setField: (key: string, value: unknown) => void;
}) {
  const { draft, selected, fields, mode, setField } = input;
  const preferredTerm = preferredAgreementTerm(selected.terms.filter((term) => term.recordState === "confirmed"));
  const items: FormSurfaceItemSpec[] = [
    readOnlyItem("expiryDate", "到期日期", preferredTerm ? agreementTermExpiryLabel(preferredTerm) : "未设置"),
    readOnlyItem("endDate", "结束日期", selected.endDate || "未设置"),
  ];
  const editableFields = new Set(agreementContentFieldsByMissingState(selected, mode === "supplement-missing"));
  for (const key of AGREEMENT_CONTENT_FIELDS) {
    const field = fields.find((item) => item.key === key);
    if (mode !== "view" && editableFields.has(key) && field) {
      items.push(profileFieldSpec(
        key === "company" ? { ...field, label: "用工主体" } : field,
        draft,
        false,
        setField,
      ));
    } else {
      items.push(readOnlyItem(key, agreementContentFieldLabel(key), agreementContentFieldValue(selected, key)));
    }
  }
  if (mode !== "view") items.push(reasonItem(draft, setField, mode));
  return items;
}

const AGREEMENT_TABLE_COLUMNS: Array<DataSurfaceColumnSpec<ContractRow>> = [
  { key: "type", label: "协议类型", cell: (row) => ({ kind: "text", value: row.contractType || "未设置", emphasis: "medium" }) },
  { key: "started", label: "开始日期", cell: (row) => agreementFirstDate(row) || "—" },
  { key: "expiry", label: "到期日期", cell: (row) => {
    const term = preferredAgreementTerm(row.terms.filter((item) => item.recordState === "confirmed"));
    return term ? agreementTermExpiryLabel(term) : "—";
  } },
  { key: "end", label: "结束日期", cell: (row) => row.endDate || "—" },
  { key: "status", label: "状态", cell: (row) => ({ kind: "badge", label: agreementStatusLabel(row), tone: agreementStatusTone(row) }) },
  { key: "attachments", label: "附件", align: "right", cell: (row) => `${row.attachments.filter((item) => !item.removedAt).length} 份` },
];

export function agreementMasterSections(input: {
  agreements: ContractRow[];
  selectedCompany: string;
  selected: ContractRow | null;
  selectCompany: (company: string) => void;
  selectAgreement: (uid: string) => void;
  create?: BodySurfaceSectionCreateSpec;
  detail?: BusinessTemporalRecordDetailSpec;
}): BodySurfaceSectionSpec[] {
  const companies = [...new Set(input.agreements.map((row) => row.company || "主体未设置"))];
  const companyRows = input.agreements.filter((row) => (row.company || "主体未设置") === input.selectedCompany);
  return [
    {
      key: "agreement-company-selector",
      header: { title: "签约主体", create: input.create },
      body: {
        kind: "selector",
        selector: {
          kind: "list",
          selectedId: input.selectedCompany,
          size: "sm",
          items: companies.map((company) => ({
            key: company,
            value: company,
            card: {
              title: company,
              trailing: `${input.agreements.filter((row) => (row.company || "主体未设置") === company).length} 份协议`,
              active: company === input.selectedCompany,
            },
          })),
          onSelect: input.selectCompany,
        },
      },
    },
    ...createBusinessTemporalRecordSections({
      registration: HR_EMPLOYMENT_AGREEMENT_TEMPORAL,
      key: "employment-agreement",
      title: `协议（${companyRows.length}）`,
      rows: companyRows,
      columns: AGREEMENT_TABLE_COLUMNS,
      visibleColumns: AGREEMENT_TABLE_COLUMNS.map((column) => column.key),
      rowKey: (row) => row.agreementUid ?? row.id,
      selectedKey: input.selected?.agreementUid ?? null,
      onSelect: (row) => row.agreementUid && input.selectAgreement(row.agreementUid),
      detail: input.detail,
      emptyText: "该主体暂无协议",
    }),
  ];
}

const AGREEMENT_HISTORY_COLUMNS: Array<DataSurfaceColumnSpec<AgreementHistoryRow>> = [
  { key: "record", label: "记录", cell: (row) => ({ kind: "text", value: row.record, emphasis: "medium" }) },
  { key: "kind", label: "类别", cell: (row) => row.kind },
  { key: "validFrom", label: "开始日期", cell: (row) => row.validFrom },
  { key: "validThrough", label: "到期日期 / 登记时间", cell: (row) => row.validThrough },
  { key: "state", label: "状态", cell: (row) => row.state },
];

export function agreementHistorySupplemental(input: {
  row: ContractRow;
  selectedKey?: string | null;
  onSelect?: (row: AgreementHistoryRow) => void;
  expandedRow?: (row: AgreementHistoryRow) => DataSurfaceCellSpec | null;
}): DataSurfaceCellSpec[] {
  const rows = agreementHistoryRows(input.row);
  return [{
    kind: "data",
    data: {
      kind: "table",
      rows,
      columns: AGREEMENT_HISTORY_COLUMNS,
      visibleColumns: AGREEMENT_HISTORY_COLUMNS.map((column) => column.key),
      rowKey: (history) => history.key,
      onRowClick: input.onSelect,
      rowState: (history) => history.key === input.selectedKey ? "selected" : "normal",
      expandedRowKey: input.expandedRow && input.selectedKey ? input.selectedKey : null,
      expandedRow: input.expandedRow,
      presentation: { density: "compact", header: "tinted", rowHover: input.onSelect ? "interactive" : "neutral" },
      emptyText: "暂无期限或版本记录",
    },
  }];
}

function agreementFirstDate(row: ContractRow) {
  return row.terms
    .filter((term) => term.recordState === "confirmed")
    .map((term) => term.effectiveFrom)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
}

function agreementStatusLabel(row: ContractRow) {
  if (row.endDate) return "已结束";
  if (row.temporalState === "current") return "生效中";
  if (row.temporalState === "upcoming") return "待生效";
  if (row.temporalState === "past") return "已到期";
  return "待补充";
}

function agreementStatusTone(row: ContractRow): "green" | "blue" | "gray" | "amber" {
  if (row.endDate || row.temporalState === "past") return "gray";
  if (row.temporalState === "current") return "green";
  if (row.temporalState === "upcoming") return "blue";
  return "amber";
}

export function agreementRenewalItems(input: {
  draft: AgreementDraft;
  periodNo: number;
  setField: (key: string, value: unknown) => void;
}): FormSurfaceItemSpec[] {
  const { draft, periodNo, setField } = input;
  const items: FormSurfaceItemSpec[] = [
    readOnlyItem("periodNo", "签订期次", `第 ${periodNo} 期`),
    dateItem("effectiveFrom", "开始日期", draft.effectiveFrom, (value) => setField("effectiveFrom", value), true),
    durationKindItem(draft, setField, "renew"),
    draft.durationKind === "fixed"
      ? dateItem("effectiveThrough", "到期日期", draft.effectiveThrough, (value) => setField("effectiveThrough", value), true)
      : readOnlyItem("effectiveThrough", "到期日期", "不适用"),
  ];
  return items;
}

export function agreementTermRecordItems(input: {
  draft: AgreementDraft;
  term: ContractRow["terms"][number];
  setField: (key: string, value: unknown) => void;
}): FormSurfaceItemSpec[] {
  const { draft, term, setField } = input;
  return [
    readOnlyItem("periodNo", "签订期次", `第 ${term.sequence} 期`),
    dateItem("effectiveFrom", "开始日期", draft.effectiveFrom, (value) => setField("effectiveFrom", value), true),
    durationKindItem(draft, setField, "correct"),
    draft.durationKind === "fixed"
      ? dateItem("effectiveThrough", "到期日期", draft.effectiveThrough, (value) => setField("effectiveThrough", value), true)
      : readOnlyItem("effectiveThrough", "到期日期", "不适用"),
    reasonItem(draft, setField, "correct", "变更说明"),
  ];
}

export function agreementTermEndItems(input: {
  draft: AgreementDraft;
  term: ContractRow["terms"][number];
  setField: (key: string, value: unknown) => void;
}): FormSurfaceItemSpec[] {
  const { draft, term, setField } = input;
  return [
    readOnlyItem("periodNo", "签订期次", `第 ${term.sequence} 期`),
    readOnlyItem("period", "协议期限", contractPeriodLabel(term)),
    dateItem("effectiveThrough", "结束日期", draft.effectiveThrough, (value) => setField("effectiveThrough", value), true),
    reasonItem(draft, setField, "end"),
  ];
}

export function agreementTermCancelItems(input: {
  draft: AgreementDraft;
  term: ContractRow["terms"][number];
  setField: (key: string, value: unknown) => void;
}): FormSurfaceItemSpec[] {
  const { draft, term, setField } = input;
  return [
    readOnlyItem("periodNo", "签订期次", `第 ${term.sequence} 期`),
    readOnlyItem("period", "待生效期限", contractPeriodLabel(term)),
    reasonItem(draft, setField, "cancel-future"),
  ];
}

export function agreementTermReadonlyItems(term: ContractRow["terms"][number]): FormSurfaceItemSpec[] {
  return [
    readOnlyItem("periodNo", "签订期次", `第 ${term.sequence} 期`),
    readOnlyItem("durationKind", "期限性质", agreementTermDurationKind(term) === "indefinite" ? "无固定期限" : "固定期限"),
    readOnlyItem("effectiveFrom", "开始日期", term.effectiveFrom || "待补充"),
    readOnlyItem("effectiveThrough", "到期日期", agreementTermExpiryLabel(term)),
    readOnlyItem("reason", "记录说明", term.reason || "—"),
  ];
}

export function agreementRevisionReadonlyItems(revision: ContractRow["revisions"][number]): FormSurfaceItemSpec[] {
  return [
    readOnlyItem("revisionNo", "资料版本", `版本 ${revision.revisionNo}`),
    readOnlyItem("recordedAt", "登记时间", revision.createdAt || "—"),
    readOnlyItem("company", "用工主体", revision.content.company || "未设置"),
    readOnlyItem("legalRelation", "法律关系", revision.content.legalRelation || "未设置"),
    readOnlyItem("contractType", "协议类型", revision.content.contractType || "未设置"),
    readOnlyItem("employmentForm", "用工形式", revision.content.employmentForm || "未设置"),
    readOnlyItem("reason", "修订说明", revision.reason || "—"),
  ];
}

function appendAgreementContentItems(
  items: FormSurfaceItemSpec[],
  fields: ProfileField[],
  draft: AgreementDraft,
  setField: (key: string, value: unknown) => void,
  commandKind: EmploymentAgreementCommandKind,
  allowedFields: readonly AgreementContentField[] = AGREEMENT_CONTENT_FIELDS,
) {
  for (const key of allowedFields) {
    const field = fields.find((item) => item.key === key);
    if (field) items.push(profileFieldSpec(field, draft, employmentAgreementFieldRequired(commandKind, key), setField));
  }
}

function reasonItem(
  draft: AgreementDraft,
  setField: (key: string, value: unknown) => void,
  commandKind: EmploymentAgreementCommandKind,
  label = employmentAgreementFieldLabel(commandKind, "reason"),
): FormSurfaceItemSpec {
  return {
    key: "reason",
    label,
    required: employmentAgreementFieldRequired(commandKind, "reason"),
    spec: { valueType: "string", control: "text", state: "normal" },
    value: draft.reason,
    onChange: (value) => setField("reason", value),
  };
}

function durationKindItem(
  draft: AgreementDraft,
  setField: (key: string, value: unknown) => void,
  commandKind: EmploymentAgreementCommandKind,
): FormSurfaceItemSpec {
  return choiceItem(
    "durationKind",
    "期限性质",
    draft.durationKind,
    [{ value: "fixed", label: "固定期限" }, { value: "indefinite", label: "无固定期限" }],
    (value) => setField("durationKind", value),
    employmentAgreementFieldRequired(commandKind, "termKind"),
  );
}

function choiceItem(key: string, label: string, value: string, options: Array<{ value: string; label: string }>, onChange: (value: string) => void, required = false): FormSurfaceItemSpec {
  return {
    key,
    label,
    required,
    spec: { valueType: "string", control: "choice", state: options.length > 0 ? "normal" : "disabled", options: { source: "static", items: options, visibleCount: 8 } },
    value,
    onChange: (next) => onChange(String(next ?? "")),
  };
}

function dateItem(key: string, label: string, value: string | null, onChange: (value: unknown) => void, required = false): FormSurfaceItemSpec {
  return {
    key,
    label,
    required,
    spec: { valueType: "date", control: "temporal", precision: "date", state: "normal" },
    value,
    onChange,
  };
}

function readOnlyItem(key: string, label: string, value: string): FormSurfaceItemSpec {
  return { kind: "readonly", key, label, value };
}

function agreementContentFieldLabel(field: AgreementContentField) {
  if (field === "company") return "用工主体";
  return employmentAgreementFieldLabel("create", field);
}

function agreementContentFieldValue(agreement: ContractRow, field: AgreementContentField) {
  const value = agreement[field];
  return typeof value === "string" && value ? value : "未设置";
}

export function agreementContentFieldsByMissingState(agreement: ContractRow | null, missing: boolean): AgreementContentField[] {
  if (!agreement) return [];
  const missingPaths = new Set(agreement.missingFields.map((field) => field.path));
  return AGREEMENT_CONTENT_FIELDS.filter((field) => missingPaths.has(`content.${field}`) === missing);
}

export function agreementContentPatch(
  agreement: ContractRow,
  draft: AgreementDraft,
  kind: "supplement-missing" | "correct-existing",
): Partial<Record<AgreementContentField, string | null>> {
  const allowed = new Set(agreementContentFieldsByMissingState(agreement, kind === "supplement-missing"));
  const current: Record<AgreementContentField, string | null> = {
    company: agreement.company || null,
    legalRelation: agreement.legalRelation || null,
    contractType: agreement.contractType || null,
    employmentForm: agreement.employmentForm || null,
  };
  const patch: Partial<Record<AgreementContentField, string | null>> = {};
  for (const field of AGREEMENT_CONTENT_FIELDS) {
    if (!allowed.has(field) || draft[field] === current[field]) continue;
    patch[field] = draft[field];
  }
  return patch;
}
