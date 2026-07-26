import type {
  CreateSurfaceSectionSpec,
  DataSurfaceColumnSpec,
  FormSurfaceFieldSpec,
} from "@workspace/core/ui";
import type { CompanyRecord, CompanyRegistryChangeRecord, OwnershipInterestRecord } from "../types";

export type CompanyDraft = Omit<CompanyRecord, "id" | "version" | "partyId" | "partyVersion" | "legalFactRevision" | "registryChanges"> & {
  id?: number;
  version?: number;
  partyId?: number;
  partyVersion?: number;
  legalFactRevision?: number;
};

export const COMPANY_REGISTRY_CHANGE_COLUMNS: DataSurfaceColumnSpec<CompanyRegistryChangeRecord>[] = [
  {
    key: "changeDate",
    label: "变更日期",
    width: "md",
    wrap: "nowrap",
    cell: (row) => row.changeDate,
  },
  {
    key: "changeCategory",
    label: "类别",
    width: "md",
    wrap: "nowrap",
    cell: (row) => ({
      kind: "badge",
      label: row.changeCategory === "company_name"
        ? "名称"
        : row.changeCategory === "legal_representative"
          ? "法人"
          : row.changeCategory === "officers" ? "董事长" : "股权",
      tone: row.changeCategory === "ownership" ? "sky" : "slate",
    }),
  },
  {
    key: "changeItem",
    label: "变更事项",
    width: "xl",
    cell: (row) => ({ kind: "text", value: row.changeItem, emphasis: "medium" }),
  },
  {
    key: "contentBefore",
    label: "变更前",
    width: "xl",
    cell: (row) => registryOwnershipSnapshotCell(row, "before"),
  },
  {
    key: "contentAfter",
    label: "变更后",
    width: "xl",
    cell: (row) => registryOwnershipSnapshotCell(row, "after"),
  },
];

function registryOwnershipSnapshotCell(row: CompanyRegistryChangeRecord, side: "before" | "after") {
  const participants = row.ownershipParticipants.filter((participant) => participant.snapshotSide === side);
  if (row.changeCategory !== "ownership" || participants.length === 0) {
    return (side === "before" ? row.contentBefore : row.contentAfter) || "—";
  }
  return {
    kind: "group" as const,
    direction: "column" as const,
    items: participants.map((participant) => ({
      kind: "text" as const,
      value: participant.resolutionStatus === "resolved"
        ? participant.rawName
        : `${participant.rawName}（待认领）`,
    })),
  };
}

export const COMPANY_REGISTRY_CHANGE_VISIBLE_COLUMNS = COMPANY_REGISTRY_CHANGE_COLUMNS.map((column) => column.key);

export function createEmptyCompanyDraft(defaultManagementGroup: string): CompanyDraft {
  return {
    code: "",
    name: "",
    fullName: null,
    description: null,
    registeredCapital: null,
    unifiedCode: null,
    bankName: null,
    registeredAddress: null,
    registeredDate: null,
    legalPerson: null,
    managementGroup: defaultManagementGroup,
    codePoolCode: null,
    isActive: true,
    sortOrder: 0,
  };
}

export const OWNERSHIP_COLUMNS: DataSurfaceColumnSpec<OwnershipInterestRecord>[] = [
  {
    key: "ownerName",
    label: "持股方",
    defaultVisible: true,
    cell: (row) => ({
      kind: "text",
      value: row.ownerName,
      emphasis: "medium",
    }),
  },
  { key: "issuerName", label: "被持股方", defaultVisible: true, cell: (row) => ({ kind: "text", value: row.issuerName, emphasis: "medium" }) },
  { key: "shareRatio", label: "持股比例", align: "left", font: "default", numeric: true, cell: (row) => row.shareRatio == null ? "-" : `${(row.shareRatio * 100).toFixed(2)}%` },
  {
    key: "isConsolidated",
    label: "并表口径",
    cell: (row) => ({ kind: "badge", label: row.isConsolidated ? "纳入并表" : "不纳入并表", tone: row.isConsolidated ? "sky" : "slate" }),
  },
];

export const OWNERSHIP_VISIBLE_COLUMNS = OWNERSHIP_COLUMNS.map((column) => column.key);

export const OWNERSHIP_HISTORY_COLUMNS: DataSurfaceColumnSpec<OwnershipInterestRecord>[] = [
  {
    key: "change",
    label: "事项",
    required: true,
    width: "wide",
    wrap: "nowrap",
    cell: (row) => ({
      kind: "group",
      direction: "row",
      items: [
        { kind: "text", value: row.changeLabel ?? "集团股权结构基线", emphasis: "strong" },
        {
          kind: "badge",
          label: row.recordStatus === "confirmed" ? "已确认" : "待变更",
          tone: row.recordStatus === "confirmed" ? "green" : "amber",
        },
      ],
    }),
  },
  {
    key: "effectiveFrom",
    label: "生效日期",
    width: "md",
    wrap: "nowrap",
    cell: (row) => row.effectiveFrom ?? "—",
  },
  {
    key: "direction",
    label: "持股方 → 被持股方",
    width: "xl",
    wrap: "nowrap",
    cell: (row) => `${row.ownerName} → ${row.issuerName}`,
  },
  {
    key: "shareRatio",
    label: "持股比例",
    align: "left",
    font: "default",
    numeric: true,
    width: "md",
    wrap: "nowrap",
    cell: (row) => row.shareRatio == null ? "—" : `${(row.shareRatio * 100).toFixed(2)}%`,
  },
  {
    key: "isConsolidated",
    label: "并表口径",
    width: "md",
    wrap: "nowrap",
    cell: (row) => ({
      kind: "badge",
      label: row.isConsolidated ? "纳入并表" : "不纳入并表",
      tone: row.isConsolidated ? "sky" : "slate",
    }),
  },
  {
    key: "effectivePeriod",
    label: "有效期",
    width: "xl",
    wrap: "nowrap",
    cell: (row) => `${row.effectiveFrom ?? "未注明"} 至 ${row.effectiveTo ?? "今"}`,
  },
  {
    key: "sourceEvent",
    label: "来源事件",
    width: "xl",
    wrap: "nowrap",
    cell: (row) => row.sourceEventId === null
      ? "历史投影（待重建）"
      : `${row.sourceEventName ?? "股本事件"} · #${row.sourceEventId}${row.closedByEventId === null ? "" : ` → #${row.closedByEventId}`}`,
  },
  {
    key: "projectionRun",
    label: "投影批次",
    width: "xl",
    wrap: "nowrap",
    cell: (row) => row.projectionRunId === null
      ? "—"
      : `第 ${row.projectionGeneration ?? "?"} 代 · ${row.projectorKey ?? "capital.ownership"} v${row.projectorVersion ?? "?"}`,
  },
];

export const OWNERSHIP_HISTORY_VISIBLE_COLUMNS = OWNERSHIP_HISTORY_COLUMNS.map((column) => column.key);

export function companyFormSections(
  draft: CompanyDraft,
  onChange: <K extends keyof CompanyDraft>(key: K, value: CompanyDraft[K]) => void,
  editable = true,
): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  const text = (key: keyof CompanyDraft, label: string, required = false): FormSurfaceFieldSpec => ({
    key: String(key),
    label,
    required,
    spec: { valueType: "string", control: "text", state: editable ? "normal" : "disabled", validation: required ? { required: true } : undefined },
    value: draft[key] == null ? "" : String(draft[key]),
    onChange: (value) => onChange(key, (String(value ?? "") || null) as CompanyDraft[typeof key]),
  });
  const historicalProjection = (key: "fullName" | "legalPerson", label: string, span?: number): FormSurfaceFieldSpec => {
    const field = text(key, label);
    return {
      ...field,
      span,
      spec: { ...field.spec, state: draft.id ? "disabled" : field.spec.state },
      hint: draft.id ? "由已确认的变更历史自动生成" : undefined,
    };
  };
  return [{
    key: "identity",
    layout: { columns: 2, density: "compact" },
    items: [
      text("code", "公司编码", true),
      text("name", "公司简称", true),
      historicalProjection("fullName", "公司全称", 2),
      text("unifiedCode", "统一社会信用代码"),
      historicalProjection("legalPerson", "法定代表人"),
      text("registeredCapital", "注册资本"),
      {
        key: "registeredDate",
        label: "注册日期",
        spec: { valueType: "date", control: "temporal", precision: "date", state: editable ? "normal" : "disabled" },
        value: draft.registeredDate,
        onChange: (value) => onChange("registeredDate", value ? String(value) : null),
      },
      { ...text("registeredAddress", "注册地址"), span: 2 },
      {
        ...text("description", "公司描述"),
        span: 2,
        spec: {
          valueType: "string",
          control: "text",
          multiline: true,
          state: editable ? "normal" : "disabled",
        },
        rows: 2,
        autoGrow: true,
      },
    ],
  }];
}
