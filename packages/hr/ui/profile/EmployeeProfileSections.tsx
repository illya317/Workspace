"use client";

import { useEffect, useState } from "react";
import { SectionShell, createSectionShellSection } from "./ProfileFormControls";
import { HR_ASSIGNMENT_TEMPORAL, HR_EMPLOYMENT_TEMPORAL } from "@workspace/hr/business-temporal";
import { edpFields, employmentFields, withTenantProfileFieldOptions } from "@workspace/hr/constants";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";
import { createBusinessTemporalRecordSections, createBusinessTemporalView } from "@workspace/platform/ui";
import type { ContractRow, EdpRow, EmploymentRow, ProfileField } from "@workspace/hr/types";
import { createFieldsSection, createPageBody, createPanelSection, BodySurface, type BodySurfaceSectionSpec, type DataSurfaceColumnSpec, type ReferenceOption } from "@workspace/core/ui";
import { createEmptyFormSection, createFieldGridSection, createFieldRegionSection, fieldGridItems, pickFields, type EditableRecord, type RowBase } from "./EmployeeProfileUtils";
import { useContractSections } from "./EmployeeProfileContractSection";
import { deleteActionSpec } from "./EmployeeProfileRowActions";
export { HistorySection, createHistorySection, type ProfileHistoryEntry } from "./EmployeeProfileHistorySection";

export function RowsSection<T extends RowBase>({
  title,
  rows,
  fields,
  canEdit,
  saving,
  onChange,
  onDelete,
  allowDelete = true,
  className
}: {
  title: string;
  rows: T[];
  fields: ProfileField[];
  canEdit: boolean;
  saving: string | null;
  onChange: (index: number, field: ProfileField, value: unknown, option?: ReferenceOption) => void;
  onDelete?: (row: T, index: number) => Promise<void>;
  allowDelete?: boolean;
  className?: string;
}) {
  const sections = rows.length === 0
    ? [createEmptyFormSection("rows-empty", "暂无记录")]
    : rows.map((row, index) => createFieldRegionSection({
        key: String(row.id ?? `new-${index}`),
        title: getRowTitle(row, title),
        actions: canEdit && allowDelete && onDelete
          ? deleteActionSpec({ canEdit, saving, onDelete: () => onDelete(row, index) })
          : undefined,
        sections: [createFieldGridSection(fields, row as unknown as EditableRecord, !canEdit, (key, value, option) => {
          const field = fields.find(item => item.key === key);
          if (field) onChange(index, field, value, option);
        }, undefined, `${row.id ?? `new-${index}`}-fields`)],
      }));
  return <SectionShell title={null} className={className} sections={sections} />;
}
function getRowTitle<T extends RowBase>(row: T, fallback: string) {
  const item = row as Record<string, unknown>;
  return String(item.projectName || item.positionName || item.company || item.name || (row.isNew ? `新增${fallback}` : `${fallback} #${row.id ?? ""}`)).trim();
}
interface EmploymentSectionProps {
  employeeId: number;
  employment: EmploymentRow | null;
  employments: EmploymentRow[];
  contracts: ContractRow[];
  asOfDate: string;
  canEdit: boolean;
  saving: string | null;
  onChange: (index: number, field: ProfileField, value: unknown, option?: ReferenceOption) => void;
  onAgreementSaved: () => Promise<void>;
  className?: string;
}

export function EmploymentSection(props: EmploymentSectionProps) {
  return <BodySurface {...createPageBody(useEmploymentSections(props))} />;
}

export function useEmploymentSections({
  employeeId,
  employment,
  employments,
  contracts,
  asOfDate,
  canEdit,
  onChange,
  onAgreementSaved,
  className
}: EmploymentSectionProps): BodySurfaceSectionSpec[] {
  const tenantConfig = useTenantConfig();
  const fields = withTenantProfileFieldOptions(employmentFields, tenantConfig);
  const virtualPersonnelType = tenantConfig.hr.options.virtualEmployeePersonnelType;
  const [selectedEmploymentKey, setSelectedEmploymentKey] = useState<string | number | null>(null);
  const selectedEmploymentIndex = employments.findIndex((row) => employmentRecordKey(row) === selectedEmploymentKey);
  const selectedEmployment = selectedEmploymentIndex >= 0 ? employments[selectedEmploymentIndex] : null;

  useEffect(() => {
    setSelectedEmploymentKey((existing) => (
      existing !== null && employments.some((row) => employmentRecordKey(row) === existing)
        ? existing
        : null
    ));
  }, [employments]);

  const contractSections = useContractSections({
    employeeId,
    employments,
    rows: contracts,
    asOfDate,
    canEdit,
    onSaved: onAgreementSaved,
  });
  const sections = !employment
    ? [createEmptyFormSection("employment-empty", "暂无雇佣主档，请在“生命周期”登记入职")]
    : [
        employmentCurrentSummary(employment),
        ...createBusinessTemporalRecordSections({
          registration: HR_EMPLOYMENT_TEMPORAL,
          key: "employment",
          title: `雇佣记录（${employments.length}）`,
          rows: employments,
          columns: employmentRecordColumns(),
          visibleColumns: ["company", "status", "joinDate", "leaveDate", "personnelType", "rank"],
          rowKey: employmentRecordKey,
          selectedKey: selectedEmploymentKey,
          onSelect: (row) => setSelectedEmploymentKey((existing) => (
            existing === employmentRecordKey(row) ? null : employmentRecordKey(row)
          )),
          detail: selectedEmployment ? {
            items: fieldGridItems(
              fields,
              selectedEmployment as unknown as EditableRecord,
              !canEdit || saving !== null,
              (key, value, option) => {
                const field = fields.find((item) => item.key === key);
                if (field) onChange(selectedEmploymentIndex, field, value, option);
              },
              (field, record) => (
                field.key === "personnelType"
                && record.personnelType === virtualPersonnelType
              ),
            ),
            edit: canEdit ? {
              kind: "edit-existing",
              targetFields: fields.filter((field) => !field.readOnly).map((field) => field.key),
              persistence: "page-save",
            } : undefined,
          } : undefined,
          emptyText: "暂无雇佣记录",
        }),
        ...contractSections,
      ];
  return [createSectionShellSection({ title: null, className, sections })];
}

function employmentRecordKey(row: EmploymentRow): string | number {
  return row.id ?? `${row.employeeId}:${row.joinDate ?? "open"}:${row.leaveDate ?? "open"}`;
}

function employmentCurrentSummary(row: EmploymentRow): BodySurfaceSectionSpec {
  return createPanelSection("employment-current", {
    title: row.temporalState === "current"
      ? "当前雇佣"
      : row.temporalState === "upcoming"
        ? "待生效雇佣"
        : "最近雇佣",
    sections: [createFieldsSection("employment-current-fields", [
      { kind: "readonly", key: "company", label: "公司", value: row.currentCompany || "未设置" },
      { kind: "readonly", key: "status", label: "任职状态", value: employmentTemporalLabel(row) },
      { kind: "readonly", key: "joinDate", label: "入职日期", value: row.joinDate || "未设置" },
      { kind: "readonly", key: "leaveDate", label: "离职日期", value: row.leaveDate || "—" },
    ], { layout: { columns: 2 } })],
  });
}

function employmentRecordColumns(): Array<DataSurfaceColumnSpec<EmploymentRow>> {
  return [
    { key: "company", label: "公司", required: true, cell: (row) => row.currentCompany || "未设置" },
    {
      key: "status",
      label: "任职状态",
      required: true,
      cell: (row) => ({
        kind: "badge",
        label: employmentTemporalLabel(row),
        tone: row.temporalState === "current" ? "green" : row.temporalState === "upcoming" ? "blue" : row.temporalState === "invalid" ? "red" : "gray",
      }),
    },
    { key: "joinDate", label: "入职日期", cell: (row) => row.joinDate || "未设置" },
    { key: "leaveDate", label: "离职日期", cell: (row) => row.leaveDate || "—" },
    { key: "personnelType", label: "人员类型", cell: (row) => row.personnelType || "未设置" },
    { key: "rank", label: "职级", cell: (row) => row.rank || "未设置" },
  ];
}

function employmentTemporalLabel(row: EmploymentRow) {
  if (row.temporalState === "current") return row.isActive ? "在职 · 当前" : "当前";
  if (row.temporalState === "upcoming") return "待生效";
  if (row.temporalState === "past") return "历史";
  return "日期异常";
}

interface EdpSectionProps {
  rows: EdpRow[];
  asOfDate: string;
  className?: string;
}

export function EdpSection(props: EdpSectionProps) {
  return <BodySurface {...createPageBody(useEdpSections(props))} />;
}

export function useEdpSections({
  rows,
  asOfDate,
  className
}: EdpSectionProps): BodySurfaceSectionSpec[] {
  const allFields = [...pickFields(edpFields, ["reportingCompanyId", "departmentId", "positionId", "isPrimary", "allocationWeight", "reportToPositionId"]), ...pickFields(edpFields, ["startDate", "endDate"])];
  const sections = rows.length === 0
    ? [createEmptyFormSection("edp-empty", "暂无岗位记录，请在下方登记入职或任职变更")]
    : createBusinessTemporalView({
        kind: "effective-period",
        registration: HR_ASSIGNMENT_TEMPORAL,
        asOfDate,
        items: rows.map((row, index) => ({
          key: row.id ?? `new-edp-${index}`,
          title: `${row.positionName || `岗位记录 #${row.id}`}${row.isPrimary ? " · 主岗" : ""}`,
          description: `${row.departmentName || "未设置部门"} · 权重 ${row.allocationWeight || "未设置"}${row.allocationPercent == null ? "" : ` · 当前折算 ${(row.allocationPercent * 100).toFixed(2)}%`}`,
          validFrom: row.startDate,
          validThrough: row.endDate,
          temporalState: row.temporalState,
          recordState: "confirmed",
          details: [createFieldGridSection(
            allFields,
            row as unknown as EditableRecord,
            true,
            () => undefined,
            undefined,
            `edp-${index}-fields`,
          )],
        })),
      }).body.sections;
  return [createSectionShellSection({
    title: "岗位记录",
    className,
    sections,
  })];
}
