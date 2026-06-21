"use client";

import {
  ActionButton,
  EmptyStateCard,
  StatusBadge,
} from "@workspace/core/ui";
import { contractFields } from "@workspace/hr/constants";
import type { ContractRow, ProfileField } from "@workspace/hr/types";
import type { FkFieldOption } from "@workspace/core/ui";
import {
  contractPeriodEndDate,
  fieldGrid,
  FieldRegion,
  isCurrentByEndDate,
  normalizeContractRow,
  pickFields,
  type EditableRecord,
} from "./EmployeeProfileUtils";
import { RowActions } from "./EmployeeProfileRowActions";

export function ContractSection({
  rows,
  canEdit,
  saving,
  onAdd,
  onChange,
  onDelete,
}: {
  rows: ContractRow[];
  canEdit: boolean;
  saving: string | null;
  onAdd: () => void;
  onChange: (index: number, field: ProfileField, value: unknown, option?: FkFieldOption) => void;
  onDelete: (row: ContractRow, index: number) => Promise<void>;
}) {
  const cardFields = pickFields(contractFields, [
    "company",
    "isPrimary",
    "insuranceStatus",
    "legalRelation",
    "contractType",
    "employmentForm",
    "confidentialityDate",
    "nonCompeteDate",
    "firstContractStartDate",
    "firstContractEndDate",
    "secondContractStartDate",
    "secondContractEndDate",
    "thirdContractStartDate",
    "thirdContractEndDate",
    "permanentContractDate",
  ]);

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {rows.length === 0 ? (
          <EmptyStateCard compact>暂无合同</EmptyStateCard>
        ) : (
          rows.map((row, index) => (
            <ContractCard
              key={row.id ?? `new-contract-${index}`}
              row={row}
              index={index}
              canEdit={canEdit}
              saving={saving}
              fields={cardFields}
              onChange={onChange}
              onAdd={onAdd}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ContractCard({
  row,
  index,
  canEdit,
  saving,
  fields,
  onChange,
  onAdd,
  onDelete,
}: {
  row: ContractRow;
  index: number;
  canEdit: boolean;
  saving: string | null;
  fields: ProfileField[];
  onChange: (index: number, field: ProfileField, value: unknown, option?: FkFieldOption) => void;
  onAdd: () => void;
  onDelete: (row: ContractRow, index: number) => Promise<void>;
}) {
  const normalizedRow = normalizeContractRow(row);
  const current = isCurrentByEndDate(normalizedRow.permanentContractDate ? normalizedRow.endDate : contractPeriodEndDate(normalizedRow));
  const title = row.company || (row.isNew ? "新增合同" : "未设置公司");
  const summary = [
    row.contractType,
    row.insuranceStatus,
  ].filter(Boolean).join(" · ");
  return (
    <FieldRegion
      title={(
        <div className="flex flex-wrap items-center gap-3">
          <span>{title}</span>
          <StatusBadge label={current ? "生效中" : "已失效"} variant={current ? "green" : "gray"} className="px-2 py-1 text-sm" />
          {row.isPrimary && <StatusBadge label="主合同" variant="blue" className="px-2 py-1 text-sm" />}
          {summary ? <span className="text-sm font-medium text-slate-500">{summary}</span> : null}
        </div>
      )}
      actions={canEdit ? (
        <>
          <ActionButton onClick={onAdd} disabled={saving !== null} variant="secondary" className="px-3 py-1.5 text-xs">新增</ActionButton>
          <RowActions canEdit={canEdit} saving={saving} onDelete={() => onDelete(row, index)} />
        </>
      ) : null}
    >
      {fieldGrid(fields, normalizedRow as unknown as EditableRecord, !canEdit, (key, value, option) => {
        const field = contractFields.find((item) => item.key === key);
        if (!field) return;
        if (field.key === "permanentContractDate" && value) {
          onChange(index, field, value, option);
          const endDateField = contractFields.find((item) => item.key === "endDate");
          if (endDateField) onChange(index, endDateField, null);
          return;
        }
        onChange(index, field, value, option);
      })}
    </FieldRegion>
  );
}
