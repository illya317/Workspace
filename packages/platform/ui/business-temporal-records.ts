import {
  createPageDataSection,
  createPanelSection,
  type BodySurfaceSectionSpec,
  type DataSurfaceCellSpec,
  type DataSurfaceColumnSpec,
  type DataSurfaceLooseRow,
  type FormSurfaceActionSpec,
  type FormSurfaceItemSpec,
} from "@workspace/core/ui";
import {
  validateBusinessTemporalBaselineMutation,
  type BusinessTemporalBaselineMutationKind,
} from "../contracts/business-temporal-baseline";
import type { BusinessTemporalRegistration } from "../contracts/business-temporal";

export interface BusinessTemporalRecordMutationSpec {
  kind: BusinessTemporalBaselineMutationKind;
  targetFields: readonly string[];
  missingFields: readonly string[];
  actions: FormSurfaceActionSpec[];
}

export interface BusinessTemporalRecordEditSpec {
  kind: "edit-existing";
  targetFields: readonly string[];
  persistence: "page-save" | "inline-action";
  actions?: FormSurfaceActionSpec[];
}

export interface BusinessTemporalRecordDetailSpec {
  items: FormSurfaceItemSpec[];
  actions?: FormSurfaceActionSpec[];
  mutation?: BusinessTemporalRecordMutationSpec;
  edit?: BusinessTemporalRecordEditSpec;
  supplemental?: DataSurfaceCellSpec[];
}

export interface BusinessTemporalRecordSectionsSpec<T extends DataSurfaceLooseRow> {
  registration: BusinessTemporalRegistration;
  key: string;
  title: string;
  rows: T[];
  columns: Array<DataSurfaceColumnSpec<T>>;
  visibleColumns: string[];
  rowKey: (row: T) => string | number;
  selectedKey: string | number | null;
  onSelect: (row: T) => void;
  detail?: BusinessTemporalRecordDetailSpec;
  emptyText?: string;
}

/**
 * Standard lifecycle record presentation: one selectable record table followed
 * by the selected record's authoritative detail. Domains provide facts and
 * commands; selection, table treatment and baseline mutation safety live here.
 */
export function createBusinessTemporalRecordSections<T extends DataSurfaceLooseRow>(
  spec: BusinessTemporalRecordSectionsSpec<T>,
): BodySurfaceSectionSpec[] {
  validateRecordViewSpec(spec.registration);
  validateMutationSpec(spec.registration, spec.detail?.mutation);
  validateEditSpec(spec.registration, spec.detail?.edit, spec.detail?.mutation);
  const sections: BodySurfaceSectionSpec[] = [createPanelSection(`${spec.key}-records`, {
    title: spec.title,
    sections: [createPageDataSection(`${spec.key}-table`, {
      kind: "table",
      rows: spec.rows,
      columns: spec.columns,
      visibleColumns: spec.visibleColumns,
      rowKey: spec.rowKey,
      onRowClick: spec.onSelect,
      rowState: (row) => spec.rowKey(row) === spec.selectedKey ? "selected" : "normal",
      expandedRowKey: spec.detail ? spec.selectedKey : null,
      expandedRow: spec.detail ? () => expandedRecordDetail(spec.detail!) : undefined,
      presentation: { density: "compact", header: "tinted", rowHover: "interactive" },
      emptyText: spec.emptyText ?? "暂无记录",
    })],
  })];
  return sections;
}

function expandedRecordDetail(detail: BusinessTemporalRecordDetailSpec): DataSurfaceCellSpec {
  const form: DataSurfaceCellSpec = {
    kind: "form",
    form: {
      kind: "fields",
      content: { items: detail.items, layout: { columns: 2 } },
      actions: detail.mutation?.actions ?? detail.edit?.actions ?? detail.actions,
    },
  };
  if (!detail.supplemental?.length) return form;
  return { kind: "group", direction: "column", items: [form, ...detail.supplemental] };
}

function validateRecordViewSpec(registration: BusinessTemporalRegistration) {
  if (registration.ui.recordView?.presentation !== "expandable-record-list") {
    throw new Error(
      `Business Temporal registration ${registration.key} 未声明 ui.recordView=expandable-record-list`,
    );
  }
}

function validateEditSpec(
  registration: BusinessTemporalRegistration,
  edit: BusinessTemporalRecordEditSpec | undefined,
  mutation: BusinessTemporalRecordMutationSpec | undefined,
) {
  if (!edit) return;
  if (mutation) {
    throw new Error("同一条生命周期记录不能同时配置普通编辑和 baseline 补缺/纠错");
  }
  if (registration.policy.revision === "forbid") {
    throw new Error(`Business Temporal registration ${registration.key} 禁止编辑已登记记录`);
  }
  if (!registration.commands.includes("change") && !registration.commands.includes("correct")) {
    throw new Error(`Business Temporal registration ${registration.key} 未声明 change/correct 命令`);
  }
  if (edit.targetFields.length === 0 || edit.targetFields.some((field) => !field.trim())) {
    throw new Error("Business Temporal record edit-existing 必须声明可编辑字段");
  }
  if (edit.persistence === "inline-action" && !edit.actions?.length) {
    throw new Error("Business Temporal record inline-action 编辑必须声明保存动作");
  }
}

function validateMutationSpec(
  registration: BusinessTemporalRegistration,
  mutation: BusinessTemporalRecordMutationSpec | undefined,
) {
  if (!mutation) return;
  const baseline = registration.baseline;
  if (!baseline) {
    throw new Error(`Business Temporal registration ${registration.key} 未声明 baseline，不能配置资料补充或修正`);
  }
  if (
    mutation.kind === "supplement-missing"
    && (
      baseline.missingFieldPresentation !== "inline-editable"
      || baseline.knownFieldPresentation !== "read-only"
    )
  ) {
    throw new Error(`Business Temporal registration ${registration.key} 不允许原位补充缺失资料`);
  }
  if (
    mutation.kind === "correct-existing"
    && baseline.existingFactCorrectionPresentation !== "explicit-mode"
  ) {
    throw new Error(`Business Temporal registration ${registration.key} 不允许显式修正既有资料`);
  }
  const validation = validateBusinessTemporalBaselineMutation({
    kind: mutation.kind,
    missingFields: mutation.missingFields,
    changedFields: mutation.targetFields,
  });
  if (!validation.ok) {
    throw new Error(`Business Temporal record mutation ${mutation.kind} 字段配置无效: ${validation.reason}`);
  }
}
