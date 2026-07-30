import { type BodySurfaceSectionCreateSpec, type BodySurfaceSectionSpec, type DataSurfaceCellSpec, type DataSurfaceColumnSpec, type FormSurfaceItemSpec } from "@workspace/core/ui";
import { HR_EMPLOYMENT_AGREEMENT_TEMPORAL } from "@workspace/hr/business-temporal";
import { employmentAgreementFieldRequired, employmentAgreementFieldLabel, type EmploymentAgreementCommandKind, type EmploymentAgreementFormField } from "@workspace/hr/employment-agreement-field-contract";
import type { ContractRow, EmploymentRow, ProfileField } from "@workspace/hr/types";
import { createBusinessTemporalRecordSections, type BusinessTemporalRecordDetailSpec } from "@workspace/platform/ui";
import { profileFieldSpec } from "./EmployeeProfileFieldSpecs";
import { contractPeriodLabel } from "./EmployeeProfileContractView";
import type { EditableRecord } from "./EmployeeProfileUtils";

export type AgreementCommandKind = Exclude<EmploymentAgreementCommandKind, "supplement-missing" | "correct-existing">;

export interface AgreementDraft extends EditableRecord {
  kind: AgreementCommandKind;
  agreementUid: string;
  employmentId: number | null;
  termUid: string;
  effectiveFrom: string;
  effectiveThrough: string | null;
  termKind: "initial" | "renewal" | "permanent";
  company: string | null;
  legalRelation: string | null;
  contractType: string | null;
  employmentForm: string | null;
  reason: string | null;
  termSupplements: Record<string, {
    effectiveFrom: string | null;
    effectiveThrough: string | null;
  }>;
}

const TERM_COMMAND_OPTIONS: Array<{ value: AgreementCommandKind; label: string }> = [
  { value: "renew", label: "续签" },
  { value: "end", label: "登记终止" },
  { value: "correct", label: "修订历史期限" },
  { value: "cancel-future", label: "取消待生效期限" },
];

const AGREEMENT_CONTENT_FIELDS = ["company", "legalRelation", "contractType", "employmentForm"] as const satisfies readonly EmploymentAgreementFormField[];
type AgreementContentField = typeof AGREEMENT_CONTENT_FIELDS[number];

export function createAgreementItems(input: {
  draft: AgreementDraft;
  fields: ProfileField[];
  setField: (key: string, value: unknown) => void;
}): FormSurfaceItemSpec[] {
  const { draft, fields, setField } = input;
  const items: FormSurfaceItemSpec[] = [
    dateItem("effectiveFrom", "开始日期", draft.effectiveFrom, (value) => setField("effectiveFrom", value), employmentAgreementFieldRequired("create", "effectiveFrom")),
    dateItem("effectiveThrough", employmentAgreementFieldLabel("create", "effectiveThrough"), draft.effectiveThrough, (value) => setField("effectiveThrough", value)),
    choiceItem("termKind", "期限类型", termKindForCommand("create", draft.termKind), [{ value: "initial", label: "首签" }, { value: "permanent", label: "无固定期限" }], (value) => setField("termKind", value), employmentAgreementFieldRequired("create", "termKind")),
  ];
  appendAgreementContentItems(items, fields, draft, setField, "create");
  items.push(reasonItem(draft, setField, "create"));
  return items;
}

export function agreementDetailItems(input: {
  draft: AgreementDraft;
  selected: ContractRow;
  fields: ProfileField[];
  mode: "view" | "supplement-missing" | "correct-existing";
  setField: (key: string, value: unknown) => void;
}) {
  const { draft, selected, fields, mode, setField } = input;
  const items: FormSurfaceItemSpec[] = [
    readOnlyItem("expiryDate", "到期日期", selected.expiryDate || (selected.terms.some((term) => term.recordState === "confirmed" && term.termKind === "permanent" && !term.effectiveThrough) ? "无固定期限" : "未设置")),
    readOnlyItem("endDate", "结束日期", selected.endDate || "未设置"),
  ];
  if (mode === "supplement-missing") {
    for (const missingField of agreementMissingTermFields(selected)) {
      const match = parseAgreementTermFieldPath(missingField.path);
      const term = match ? selected.terms.find((item) => item.sequence === match.sequence) : null;
      if (!term || !match) continue;
      items.push(dateItem(
        `termSupplement:${term.termUid}:${match.field}`,
        missingField.label,
        draft.termSupplements[term.termUid]?.[match.field] ?? term[match.field],
        (value) => setField(`termSupplement:${term.termUid}:${match.field}`, value),
        true,
      ));
    }
  }
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
  { key: "signed", label: "签署日期", cell: (row) => agreementFirstDate(row) || "—" },
  { key: "expiry", label: "到期日期", cell: (row) => row.expiryDate || (row.terms.some((term) => term.termKind === "permanent" && !term.effectiveThrough) ? "无固定期限" : "—") },
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

interface AgreementHistoryRow {
  key: string;
  targetKind: "term" | "revision";
  targetUid: string;
  editable: boolean;
  record: string;
  kind: string;
  validFrom: string;
  validThrough: string;
  state: string;
}

const AGREEMENT_HISTORY_COLUMNS: Array<DataSurfaceColumnSpec<AgreementHistoryRow>> = [
  { key: "record", label: "记录", cell: (row) => ({ kind: "text", value: row.record, emphasis: "medium" }) },
  { key: "kind", label: "类别", cell: (row) => row.kind },
  { key: "validFrom", label: "开始日期", cell: (row) => row.validFrom },
  { key: "validThrough", label: "到期日期 / 登记时间", cell: (row) => row.validThrough },
  { key: "state", label: "状态", cell: (row) => row.state },
];

export function agreementHistorySupplemental(row: ContractRow, actions?: {
  onEditTerm: (termUid: string) => void;
  onCorrectContent: () => void;
}): DataSurfaceCellSpec[] {
  const rows: AgreementHistoryRow[] = [
    ...row.terms.map((term) => ({
      key: `term-${term.termUid}`,
      targetKind: "term" as const,
      targetUid: term.termUid,
      editable: term.recordState === "confirmed" || term.recordState === "unknown",
      record: `${termKindLabel(term.termKind)} · 第 ${term.sequence} 期`,
      kind: "协议期限",
      validFrom: term.effectiveFrom || "待补充",
      validThrough: term.effectiveThrough || (term.termKind === "permanent" ? "无固定期限" : "待补充"),
      state: termRecordStateLabel(term.recordState, term.temporalState),
    })),
    ...row.revisions.map((revision) => ({
      key: `revision-${revision.revisionUid}`,
      targetKind: "revision" as const,
      targetUid: revision.revisionUid,
      editable: revision.revisionUid === row.currentRevisionUid,
      record: `${revisionKindLabel(revision.changeKind)} · 版本 ${revision.revisionNo}`,
      kind: "资料版本",
      validFrom: "—",
      validThrough: revision.createdAt || "—",
      state: revision.revisionUid === row.currentRevisionUid ? "当前" : revisionRecordStateLabel(revision.recordState),
    })),
  ];
  return [{
    kind: "data",
    data: {
      kind: "table",
      rows,
      columns: AGREEMENT_HISTORY_COLUMNS,
      visibleColumns: AGREEMENT_HISTORY_COLUMNS.map((column) => column.key),
      rowKey: (history) => history.key,
      rowActions: actions ? (history) => history.editable ? [{
        key: `edit-${history.key}`,
        label: history.targetKind === "term" ? "修订期限" : "修正资料",
        kind: "edit" as const,
        onClick: () => history.targetKind === "term"
          ? actions.onEditTerm(history.targetUid)
          : actions.onCorrectContent(),
      }] : [] : undefined,
      actionsColumn: actions ? { label: "操作" } : undefined,
      presentation: { density: "compact", header: "tinted" },
      emptyText: "暂无期限或版本记录",
    },
  }];
}

function termKindLabel(kind: ContractRow["terms"][number]["termKind"]) {
  if (kind === "initial") return "首签";
  if (kind === "renewal") return "续签";
  if (kind === "permanent") return "无固定期限";
  return "历史期限";
}

function termRecordStateLabel(recordState: ContractRow["terms"][number]["recordState"], temporalState: ContractRow["terms"][number]["temporalState"]) {
  if (recordState === "cancelled") return "已取消";
  if (recordState === "superseded") return "已替代";
  if (recordState === "voided") return "已作废";
  if (recordState === "unknown") return "状态待补充";
  if (temporalState === "current") return "当前";
  if (temporalState === "upcoming") return "待生效";
  return "历史";
}

function revisionKindLabel(kind: ContractRow["revisions"][number]["changeKind"]) {
  if (kind === "baseline-import") return "初始资料";
  if (kind === "supplement") return "补充资料";
  if (kind === "correction") return "资料修正";
  if (kind === "amendment") return "协议修订";
  if (kind === "initial") return "初始资料";
  if (kind === "legacy") return "历史资料";
  return "资料版本";
}

function revisionRecordStateLabel(state: ContractRow["revisions"][number]["recordState"]) {
  if (state === "draft") return "草稿";
  if (state === "cancelled") return "已取消";
  if (state === "superseded") return "已替代";
  if (state === "unknown") return "状态待补充";
  return "历史";
}

function agreementFirstDate(row: ContractRow) {
  return row.terms.map((term) => term.effectiveFrom).filter((value): value is string => Boolean(value)).sort()[0] ?? null;
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

export function termCommandItems(input: {
  draft: AgreementDraft;
  selected: ContractRow;
  setField: (key: string, value: unknown) => void;
  selectTerm: (uid: string) => void;
}) {
  const { draft, selected, setField, selectTerm } = input;
  const commandOptions = selected.migrationState === "baseline-incomplete"
    ? TERM_COMMAND_OPTIONS.filter((option) => option.value === "correct")
    : TERM_COMMAND_OPTIONS;
  const items: FormSurfaceItemSpec[] = [choiceItem("kind", "期限动作", draft.kind, commandOptions, (value) => setField("kind", value), employmentAgreementFieldRequired(draft.kind, "kind"))];
  if (["end", "correct", "cancel-future"].includes(draft.kind)) {
    const selectableTerms = selected.terms.filter((term) => term.recordState === "confirmed" || (draft.kind === "correct" && term.recordState === "unknown"));
    items.push(choiceItem("termUid", employmentAgreementFieldLabel(draft.kind, "termUid"), draft.termUid, selectableTerms.map((term) => ({ value: term.termUid, label: contractPeriodLabel(term) })), selectTerm, employmentAgreementFieldRequired(draft.kind, "termUid")));
  }
  if (["renew", "correct"].includes(draft.kind)) {
    items.push(dateItem("effectiveFrom", "开始日期", draft.effectiveFrom, (value) => setField("effectiveFrom", value), employmentAgreementFieldRequired(draft.kind, "effectiveFrom")));
  }
  if (["renew", "end", "correct"].includes(draft.kind)) {
    items.push(dateItem("effectiveThrough", employmentAgreementFieldLabel(draft.kind, "effectiveThrough"), draft.effectiveThrough, (value) => setField("effectiveThrough", value), employmentAgreementFieldRequired(draft.kind, "effectiveThrough")));
  }
  if (["renew", "correct"].includes(draft.kind)) {
    items.push(choiceItem("termKind", "期限类型", termKindForCommand(draft.kind, draft.termKind), [
      ...(draft.kind === "renew" ? [{ value: "renewal", label: "续签" }] : [{ value: "initial", label: "首签" }, { value: "renewal", label: "续签" }]),
      { value: "permanent", label: "无固定期限" },
    ], (value) => setField("termKind", value), employmentAgreementFieldRequired(draft.kind, "termKind")));
  }
  items.push(reasonItem(draft, setField, draft.kind));
  return items;
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

function reasonItem(draft: AgreementDraft, setField: (key: string, value: unknown) => void, commandKind: EmploymentAgreementCommandKind): FormSurfaceItemSpec {
  return {
    key: "reason",
    label: employmentAgreementFieldLabel(commandKind, "reason"),
    required: employmentAgreementFieldRequired(commandKind, "reason"),
    spec: { valueType: "string", control: "text", state: "normal" },
    value: draft.reason,
    onChange: (value) => setField("reason", value),
  };
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

export function initialDraft(employments: EmploymentRow[], agreements: ContractRow[], asOfDate: string): AgreementDraft {
  const agreement = agreements.find((row) => row.isPrimary) ?? agreements[0] ?? null;
  const kind: AgreementCommandKind = agreement?.migrationState === "baseline-incomplete"
    ? "correct"
    : agreements.length > 0 ? "renew" : "create";
  return applyAgreement({
    ...emptyAgreementDraft(employments, asOfDate),
    kind,
    termKind: agreements.length > 0 ? "renewal" : "initial",
  }, agreement);
}

export function emptyAgreementDraft(employments: EmploymentRow[], asOfDate: string): AgreementDraft {
  return {
    kind: "create",
    agreementUid: "",
    employmentId: employments.find((row) => row.temporalState === "current")?.id ?? employments[0]?.id ?? null,
    termUid: "",
    effectiveFrom: asOfDate,
    effectiveThrough: null,
    termKind: "initial",
    company: null,
    legalRelation: null,
    contractType: null,
    employmentForm: null,
    reason: null,
    termSupplements: {},
  };
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

export function agreementSupplementPatch(agreement: ContractRow, draft: AgreementDraft) {
  const content = agreementContentPatch(agreement, draft, "supplement-missing");
  const terms = agreementMissingTermFields(agreement).flatMap((missingField) => {
    const match = parseAgreementTermFieldPath(missingField.path);
    const term = match ? agreement.terms.find((item) => item.sequence === match.sequence) : null;
    const value = term && match ? draft.termSupplements[term.termUid]?.[match.field] : null;
    if (!term || !match || !value || value === term[match.field]) return [];
    return [{ termUid: term.termUid, [match.field]: value }];
  });
  return {
    ...(Object.keys(content).length > 0 ? { content } : {}),
    ...(terms.length > 0 ? { terms } : {}),
  };
}

export function agreementMissingTermFields(agreement: ContractRow | null) {
  return agreement?.missingFields.filter((field) => parseAgreementTermFieldPath(field.path)) ?? [];
}

function parseAgreementTermFieldPath(path: string) {
  const match = /^terms\.(\d+)\.(effectiveFrom|effectiveThrough)$/.exec(path);
  return match ? {
    sequence: Number(match[1]),
    field: match[2] as "effectiveFrom" | "effectiveThrough",
  } : null;
}

export function termKindForCommand(kind: AgreementCommandKind, termKind: AgreementDraft["termKind"]): AgreementDraft["termKind"] {
  if (termKind === "permanent") return termKind;
  if (kind === "create") return "initial";
  if (kind === "renew") return "renewal";
  return termKind;
}

export function applyAgreement(draft: AgreementDraft, agreement: ContractRow | null): AgreementDraft {
  if (!agreement) return draft;
  const term = agreement.migrationState === "baseline-incomplete"
    ? agreement.terms.find((item) => !item.effectiveFrom) ?? agreement.terms.find((item) => item.recordState === "confirmed") ?? null
    : agreement.terms.filter((item) => item.recordState === "confirmed").at(-1) ?? agreement.terms.filter((item) => item.recordState === "unknown").at(-1) ?? null;
  const renewing = draft.kind === "renew" && agreement.migrationState !== "baseline-incomplete";
  return {
    ...draft,
    kind: agreement.migrationState === "baseline-incomplete" ? "correct" : draft.kind,
    agreementUid: agreement.agreementUid || "",
    employmentId: agreement.employmentId,
    termUid: term?.termUid ?? "",
    effectiveFrom: renewing ? draft.effectiveFrom : term?.effectiveFrom ?? "",
    effectiveThrough: renewing ? null : term?.effectiveThrough ?? null,
    termKind: renewing ? "renewal" : term?.termKind === "renewal" || term?.termKind === "permanent" ? term.termKind : "initial",
    company: agreement.company || null,
    legalRelation: agreement.legalRelation || null,
    contractType: agreement.contractType || null,
    employmentForm: agreement.employmentForm || null,
    termSupplements: Object.fromEntries(agreement.terms.map((item) => [item.termUid, {
      effectiveFrom: item.effectiveFrom,
      effectiveThrough: item.effectiveThrough,
    }])),
  };
}
