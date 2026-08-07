"use client";

import { SectionShell, createSectionShellSection } from "./ProfileFormControls";
import { edpFields, employmentFields, withTenantProfileFieldOptions } from "@workspace/hr/constants";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";
import type { ContractRow, EdpRow, EmploymentRow, ProfileField } from "@workspace/hr/types";
import { createPageBody, BodySurface, type BodySurfaceSectionSpec, type ReferenceOption } from "@workspace/core/ui";
import { createEmptyFormSection, createFieldGridSection, createFieldRegionSection, isCurrentByDateRange, pickFields, type EditableRecord, type RowBase } from "./EmployeeProfileUtils";
import { useContractSections } from "./EmployeeProfileContractSection";
import { deleteActionSpec, profileActionSpec } from "./EmployeeProfileRowActions";
import { useScrollToAddedItem } from "../hooks/useScrollToAddedItem";
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
  employment: EmploymentRow | null;
  contracts: ContractRow[];
  canEdit: boolean;
  saving: string | null;
  onChange: (field: ProfileField, value: unknown, option?: ReferenceOption) => void;
  onAddContract: () => void;
  onChangeContract: (index: number, field: ProfileField, value: unknown, option?: ReferenceOption) => void;
  onDeleteContract: (row: ContractRow, index: number) => Promise<void>;
  className?: string;
}

export function EmploymentSection(props: EmploymentSectionProps) {
  return <BodySurface {...createPageBody(useEmploymentSections(props))} />;
}

const PRIMARY_CONTRACT_FIELD_KEY = "primaryContractCompany";
const PRIMARY_CONTRACT_FLAG_FIELD: ProfileField = { key: "isPrimary", label: "主合同", type: "boolean" };

export function useEmploymentSections({
  employment,
  contracts,
  canEdit,
  saving,
  onChange,
  onAddContract,
  onChangeContract,
  onDeleteContract,
  className
}: EmploymentSectionProps): BodySurfaceSectionSpec[] {
  const tenantConfig = useTenantConfig();
  const fields = withTenantProfileFieldOptions(employmentFields, tenantConfig).filter(field => !["currentCompany", "leaveNote"].includes(field.key));
  const virtualPersonnelType = tenantConfig.hr.options.virtualEmployeePersonnelType;
  // 主合同按用工主体选择，覆盖该任职下全部合同（含已失效），命中的第一条置为主合同
  const contractCompanies = [...new Set(contracts.map((row) => row.company).filter(Boolean))];
  const statusFields = contractCompanies.length > 0
    ? [...fields, { key: PRIMARY_CONTRACT_FIELD_KEY, label: "主合同", type: "select" as const, options: contractCompanies }]
    : fields;
  const employmentRecord = employment
    ? {
      ...employment,
      [PRIMARY_CONTRACT_FIELD_KEY]: contracts.find((row) => row.isPrimary)?.company ?? "",
    } as unknown as EditableRecord
    : null;
  function changePrimaryContract(value: unknown) {
    const company = typeof value === "string" ? value : "";
    let assigned = false;
    contracts.forEach((row, index) => {
      const next = Boolean(company) && !assigned && row.company === company;
      if (next) assigned = true;
      if (Boolean(row.isPrimary) !== next) onChangeContract(index, PRIMARY_CONTRACT_FLAG_FIELD, next);
    });
  }
  const contractSections = useContractSections({
    rows: contracts,
    canEdit,
    saving,
    onAdd: onAddContract,
    onChange: onChangeContract,
    onDelete: onDeleteContract,
  });
  const sections = !employment
    ? [createEmptyFormSection("employment-empty", "暂无雇佣主档")]
    : [
        createFieldRegionSection({
          key: "employment-status",
          title: "任职状态",
          sections: [createFieldGridSection(statusFields, employmentRecord as EditableRecord, !canEdit, (key, value, option) => {
          if (key === PRIMARY_CONTRACT_FIELD_KEY) {
            changePrimaryContract(value);
            return;
          }
          const field = statusFields.find(item => item.key === key);
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
  canEdit: boolean;
  saving: string | null;
  onAdd: () => void;
  onChange: (index: number, field: ProfileField, value: unknown, option?: ReferenceOption) => void;
  onDelete: (row: EdpRow, index: number) => Promise<void>;
  className?: string;
}

export function EdpSection(props: EdpSectionProps) {
  return <BodySurface {...createPageBody(useEdpSections(props))} />;
}

export function useEdpSections({
  rows,
  canEdit,
  saving,
  onAdd,
  onChange,
  onDelete,
  className
}: EdpSectionProps): BodySurfaceSectionSpec[] {
  const allFields = [...pickFields(edpFields, ["reportingCompanyId", "departmentId", "positionId", "isPrimary", "allocationWeight", "reportToPositionId"]), ...pickFields(edpFields, ["startDate", "endDate"])];
  const {
    getItemRef,
    requestScrollToIndex
  } = useScrollToAddedItem(rows);
  function addRow() {
    requestScrollToIndex(0);
    onAdd();
  }
  const sections = rows.length === 0
    ? [createEmptyFormSection("edp-empty", "暂无岗位记录")]
    : rows.map((row, index) => {
        const current = isCurrentByDateRange(row.startDate, row.endDate);
        return createFieldRegionSection({
          key: String(row.id ?? `new-edp-${index}`),
          itemRef: getItemRef(index),
          title: <div className="flex flex-wrap items-center gap-2">
                      <span>{row.isNew ? "新增岗位记录" : row.positionName || `岗位记录 #${row.id}`}</span>
                      <InlineStatusChip label={current ? "当前岗位" : "历史岗位"} tone={current ? "green" : "gray"} />
                      {row.isPrimary && <InlineStatusChip label="主岗" tone="blue" />}
                      <span className="text-xs font-medium text-slate-500">{row.departmentName || "未设置部门"} · 当前折算 {row.allocationPercent == null ? "未设置" : `${(row.allocationPercent * 100).toFixed(2)}%`}</span>
                    </div>,
          actions: row.isNew ? deleteActionSpec({ canEdit, saving, onDelete: () => onDelete(row, index) }) : [],
          sections: [createFieldGridSection(allFields, row as unknown as EditableRecord, !canEdit, (key, value, option) => {
              const field = edpFields.find(item => item.key === key);
              if (field) onChange(index, field, value, option);
            }, undefined, `edp-${index}-fields`)],
        });
      });
  return [createSectionShellSection({
    title: "岗位记录",
    className,
    actions: canEdit ? [profileActionSpec({ key: "add-edp", label: "新增岗位记录", variant: "secondary", disabled: saving !== null, onClick: addRow })] : undefined,
    sections,
  })];
}
