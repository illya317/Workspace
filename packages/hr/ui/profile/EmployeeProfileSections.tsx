"use client";

import { SectionShell, createSectionShellSection } from "./ProfileFormControls";
import { edpFields, employmentFields, withTenantProfileFieldOptions } from "@workspace/hr/constants";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";
import type { ContractRow, EdpRow, EmploymentRow, ProfileField } from "@workspace/hr/types";
import { createPageBody, BodySurface, type BodySurfaceSectionSpec, type ReferenceOption } from "@workspace/core/ui";
import { createEmptyFormSection, createFieldGridSection, createFieldRegionSection, pickFields, type EditableRecord, type RowBase } from "./EmployeeProfileUtils";
import { useContractSections } from "./EmployeeProfileContractSection";
import { deleteActionSpec } from "./EmployeeProfileRowActions";
export { HistorySection, createHistorySection, type ProfileHistoryEntry } from "./EmployeeProfileHistorySection";

function InlineStatusChip({
  label,
  tone = "gray",
}: {
  label: string;
  tone?: "green" | "blue" | "gray";
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "blue"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-slate-200 bg-slate-100 text-slate-600";
  return <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${toneClass}`}>{label}</span>;
}

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
  onChange: (field: ProfileField, value: unknown, option?: ReferenceOption) => void;
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
  const fields = withTenantProfileFieldOptions(employmentFields, tenantConfig).filter(field => !["currentCompany", "leaveNote"].includes(field.key));
  const virtualPersonnelType = tenantConfig.hr.options.virtualEmployeePersonnelType;
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
        createFieldRegionSection({
          key: "employment-status",
          title: <div className="flex flex-wrap items-center gap-2">
            <span>任职状态</span>
            <InlineStatusChip
              label={employment.temporalState === "current"
                ? "当前雇佣"
                : employment.temporalState === "upcoming"
                  ? "待生效"
                  : employment.temporalState === "past"
                    ? "历史雇佣"
                    : "日期异常"}
              tone={employment.temporalState === "current"
                ? "green"
                : employment.temporalState === "upcoming"
                  ? "blue"
                  : "gray"}
            />
          </div>,
          sections: [createFieldGridSection(fields, employment as unknown as EditableRecord, !canEdit, (key, value, option) => {
          const field = fields.find(item => item.key === key);
          if (field) onChange(field, value, option);
          }, (field, record) => (
            field.key === "personnelType"
            && record.personnelType === virtualPersonnelType
          ), "employment-fields")],
        }),
        ...contractSections,
      ];
  return [createSectionShellSection({ title: null, className, sections })];
}

interface EdpSectionProps {
  rows: EdpRow[];
  className?: string;
}

export function EdpSection(props: EdpSectionProps) {
  return <BodySurface {...createPageBody(useEdpSections(props))} />;
}

export function useEdpSections({
  rows,
  className
}: EdpSectionProps): BodySurfaceSectionSpec[] {
  const allFields = [...pickFields(edpFields, ["reportingCompanyId", "departmentId", "positionId", "isPrimary", "workPercent", "reportToPositionId"]), ...pickFields(edpFields, ["startDate", "endDate"])];
  const sections = rows.length === 0
    ? [createEmptyFormSection("edp-empty", "暂无岗位记录，请在“生命周期”登记入职或任职变更")]
    : rows.map((row, index) => {
        const temporalLabel = row.temporalState === "current"
          ? "当前岗位"
          : row.temporalState === "upcoming"
            ? "待生效"
            : row.temporalState === "past"
              ? "历史岗位"
              : "日期异常";
        const temporalTone = row.temporalState === "current"
          ? "green" as const
          : row.temporalState === "upcoming"
            ? "blue" as const
            : "gray" as const;
        return createFieldRegionSection({
          key: String(row.id ?? `new-edp-${index}`),
          title: <div className="flex flex-wrap items-center gap-2">
                      <span>{row.positionName || `岗位记录 #${row.id}`}</span>
                      <InlineStatusChip label={temporalLabel} tone={temporalTone} />
                      {row.isPrimary && <InlineStatusChip label="主岗" tone="blue" />}
                      <span className="text-xs font-medium text-slate-500">{row.departmentName || "未设置部门"} · 占比 {row.workPercent || "未设置"}</span>
                    </div>,
          sections: [createFieldGridSection(
            allFields,
            row as unknown as EditableRecord,
            true,
            () => undefined,
            undefined,
            `edp-${index}-fields`,
          )],
        });
      });
  return [createSectionShellSection({
    title: "岗位记录",
    className,
    sections,
  })];
}
