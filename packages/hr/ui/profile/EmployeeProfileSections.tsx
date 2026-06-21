"use client";

import {
  ActionButton,
  EmptyStateCard,
  StatusBadge,
} from "@workspace/core/ui";
import { SectionShell } from "./ProfileFormControls";
import {
  edpFields,
  employmentFields,
} from "@workspace/hr/constants";
import type {
  ContractRow,
  EdpRow,
  EmploymentRow,
  ProfileField,
} from "@workspace/hr/types";
import type { FkFieldOption } from "@workspace/core/ui";
import {
  fieldGrid,
  FieldRegion,
  isCurrentByEndDate,
  pickFields,
  type EditableRecord,
  type RowBase,
} from "./EmployeeProfileUtils";
import { ContractSection } from "./EmployeeProfileContractSection";
import { RowActions } from "./EmployeeProfileRowActions";
export { HistorySection, type ProfileHistoryEntry } from "./EmployeeProfileHistorySection";

export function RowsSection<T extends RowBase>({
  title,
  rows,
  fields,
  canEdit,
  saving,
  onChange,
  onDelete,
  allowDelete = true,
  className,
}: {
  title: string;
  rows: T[];
  fields: ProfileField[];
  canEdit: boolean;
  saving: string | null;
  onChange: (index: number, field: ProfileField, value: unknown, option?: FkFieldOption) => void;
  onDelete?: (row: T, index: number) => Promise<void>;
  allowDelete?: boolean;
  className?: string;
}) {
  return (
    <SectionShell
      title={null}
      className={className}
    >
      <div className="space-y-4">
        {rows.length === 0 ? (
          <EmptyStateCard compact>暂无记录</EmptyStateCard>
        ) : (
          rows.map((row, index) => (
            <FieldRegion
              key={row.id ?? `new-${index}`}
              title={getRowTitle(row, title)}
              actions={canEdit && allowDelete && onDelete ? (
                <ActionButton disabled={saving !== null} onClick={() => onDelete(row, index)} variant="danger" className="px-3 py-1.5 text-xs">
                  删除
                </ActionButton>
              ) : null}
            >
              {fieldGrid(fields, row as unknown as EditableRecord, !canEdit, (key, value, option) => {
                const field = fields.find((item) => item.key === key);
                if (field) onChange(index, field, value, option);
              })}
            </FieldRegion>
          ))
        )}
      </div>
    </SectionShell>
  );
}

function getRowTitle<T extends RowBase>(row: T, fallback: string) {
  const item = row as Record<string, unknown>;
  return String(item.projectName || item.positionName || item.company || item.name || (row.isNew ? `新增${fallback}` : `${fallback} #${row.id ?? ""}`)).trim();
}

export function EmploymentSection({
  employment,
  contracts,
  canEdit,
  saving,
  onChange,
  onAddContract,
  onChangeContract,
  onDeleteContract,
  className,
}: {
  employment: EmploymentRow | null;
  contracts: ContractRow[];
  canEdit: boolean;
  saving: string | null;
  onChange: (field: ProfileField, value: unknown, option?: FkFieldOption) => void;
  onAddContract: () => void;
  onChangeContract: (index: number, field: ProfileField, value: unknown, option?: FkFieldOption) => void;
  onDeleteContract: (row: ContractRow, index: number) => Promise<void>;
  className?: string;
}) {
  const fields = employmentFields.filter((field) => !["currentCompany", "leaveNote"].includes(field.key));
  return (
    <SectionShell
      title={null}
      className={className}
    >
      {!employment ? (
        <EmptyStateCard compact>暂无雇佣主档</EmptyStateCard>
      ) : (
        <div className="space-y-5">
          <FieldRegion title="任职状态">
            {fieldGrid(fields, employment as unknown as EditableRecord, !canEdit, (key, value, option) => {
              const field = fields.find((item) => item.key === key);
              if (field) onChange(field, value, option);
            })}
          </FieldRegion>
          <ContractSection
            rows={contracts}
            canEdit={canEdit}
            saving={saving}
            onAdd={onAddContract}
            onChange={onChangeContract}
            onDelete={onDeleteContract}
          />
        </div>
      )}
    </SectionShell>
  );
}

export function EdpSection({
  rows,
  canEdit,
  saving,
  onAdd,
  onChange,
  onDelete,
  className,
}: {
  rows: EdpRow[];
  canEdit: boolean;
  saving: string | null;
  onAdd: () => void;
  onChange: (index: number, field: ProfileField, value: unknown, option?: FkFieldOption) => void;
  onDelete: (row: EdpRow, index: number) => Promise<void>;
  className?: string;
}) {
  const allFields = [
    ...pickFields(edpFields, ["departmentId", "positionId", "isPrimary", "workPercent", "reportTo"]),
    ...pickFields(edpFields, ["startDate", "endDate"]),
  ];

  return (
    <SectionShell
      title={null}
      className={className}
    >
      <div className="space-y-4">
        {rows.length === 0 ? (
          <EmptyStateCard compact>暂无岗位记录</EmptyStateCard>
        ) : (
          rows.map((row, index) => {
            const current = isCurrentByEndDate(row.endDate);
            return (
              <FieldRegion
                key={row.id ?? `new-edp-${index}`}
                title={(
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{row.isNew ? "新增岗位记录" : row.positionName || `岗位记录 #${row.id}`}</span>
                    <StatusBadge label={current ? "当前岗位" : "历史岗位"} variant={current ? "green" : "gray"} />
                    {row.isPrimary && <StatusBadge label="主岗" variant="blue" />}
                    <span className="text-xs font-medium text-slate-500">{row.departmentName || "未设置部门"} · 占比 {row.workPercent || "未设置"}</span>
                  </div>
                )}
                actions={canEdit ? (
                  <>
                    <ActionButton onClick={onAdd} disabled={saving !== null} variant="secondary" className="px-3 py-1.5 text-xs">新增</ActionButton>
                    <RowActions canEdit={canEdit} saving={saving} onDelete={() => onDelete(row, index)} />
                  </>
                ) : null}
              >
                {fieldGrid(allFields, row as unknown as EditableRecord, !canEdit, (key, value, option) => {
                  const field = edpFields.find((item) => item.key === key);
                  if (field) onChange(index, field, value, option);
                })}
              </FieldRegion>
            );
          })
        )}
      </div>
    </SectionShell>
  );
}
